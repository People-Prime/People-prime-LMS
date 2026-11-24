"""
Document Preview Generator for LMS Learning Materials.

Converts supported proprietary documents (DOCX, PPTX, PPT) into clean, paginated,
read-only PDF representations for inline browser viewing.
Zero external system binaries required as a strict baseline; supports LibreOffice
Headless when available on host/container for maximum layout and visual fidelity.

Architecture:
- DOCX: Native parsing via `python-docx` + `pymupdf.Story` pagination.
- PPT / PPTX:
  1. Primary: LibreOffice headless (`soffice` / `libreoffice`) execution for full
     layout, shape, table, and image fidelity.
  2. Fallback: Pure-Python slide renderer using `python-pptx`, `Pillow`, and `pymupdf`
     to generate slide-by-slide PDF pages without external system dependencies.
  3. Strict read-only preview enforcement: Original presentation files are never returned
     as downloads.
- Caching: SHA-256 content-hash preview caching in `document_previews/` with automatic
  invalidation when source files change.
"""

import base64
import hashlib
import html
import io
import logging
import os
import shutil
import subprocess
import tempfile
import docx
import pymupdf
from django.conf import settings

logger = logging.getLogger(__name__)

# Dedicated directory inside MEDIA_ROOT for cached preview PDFs
PREVIEWS_DIR = os.path.join(settings.MEDIA_ROOT, "document_previews")


def ensure_previews_dir():
    """Ensures the document previews cache directory exists."""
    os.makedirs(PREVIEWS_DIR, exist_ok=True)


def get_file_content_hash(file_path):
    """
    Computes a SHA-256 hash based on file size and mtime plus sample content.
    Fast and reliable for cache invalidation.
    """
    try:
        stat = os.stat(file_path)
        hasher = hashlib.sha256()
        hasher.update(f"{stat.st_size}_{stat.st_mtime}".encode("utf-8"))
        # Read first 64KB and last 64KB if file is large, else whole file
        with open(file_path, "rb") as f:
            if stat.st_size <= 131072:
                hasher.update(f.read())
            else:
                hasher.update(f.read(65536))
                f.seek(-65536, os.SEEK_END)
                hasher.update(f.read(65536))
        return hasher.hexdigest()
    except Exception as e:
        logger.warning("Error calculating content hash for %s: %s", file_path, e)
        return hashlib.sha256(file_path.encode("utf-8")).hexdigest()


# ==============================================================================
# DOCX PREVIEW RENDERING
# ==============================================================================

def docx_to_html_representation(docx_path):
    """
    Parses a DOCX file into clean, reading-oriented HTML suitable for PyMuPDF Story.
    Preserves:
    - Headings (H1, H2, H3, Title)
    - Paragraphs and line breaks
    - Inline formatting (bold, italic, underline)
    - Bullet lists
    - Tables (with headers and row borders)
    - Embedded raster images (base64 data URIs)
    """
    doc = docx.Document(docx_path)

    # 1. Map embedded images from relationships
    images_by_rId = {}
    for rel_id, rel in doc.part.rels.items():
        if "image" in rel.target_ref:
            try:
                blob = rel.target_part.blob
                ext = rel.target_ref.split(".")[-1].lower()
                mime = "image/jpeg" if ext in ["jpg", "jpeg"] else "image/png"
                b64 = base64.b64encode(blob).decode("ascii")
                images_by_rId[rel_id] = f"data:{mime};base64,{b64}"
            except Exception as e:
                logger.warning("Failed to extract image relation %s: %s", rel_id, e)

    # 2. Modern reading-oriented stylesheet
    css = """
    body {
        font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
        font-size: 10.5pt;
        line-height: 1.55;
        color: #1e293b;
        margin: 0;
        padding: 0;
    }
    h1 {
        font-size: 18pt;
        color: #0f172a;
        border-bottom: 2px solid #cbd5e1;
        padding-bottom: 6px;
        margin-top: 18px;
        margin-bottom: 10px;
    }
    h2 {
        font-size: 13.5pt;
        color: #1e293b;
        margin-top: 14px;
        margin-bottom: 6px;
        font-weight: 600;
    }
    h3 {
        font-size: 11.5pt;
        color: #334155;
        margin-top: 12px;
        margin-bottom: 4px;
        font-weight: 600;
    }
    p {
        margin-top: 0;
        margin-bottom: 8px;
    }
    .list-item {
        margin-bottom: 4px;
        padding-left: 18px;
        position: relative;
    }
    .list-item::before {
        content: '•';
        position: absolute;
        left: 4px;
        color: #475569;
        font-weight: bold;
    }
    table {
        border-collapse: collapse;
        width: 100%;
        margin: 14px 0;
        font-size: 9.5pt;
    }
    th, td {
        border: 1px solid #cbd5e1;
        padding: 6px 10px;
        text-align: left;
        vertical-align: top;
    }
    th {
        background-color: #f1f5f9;
        font-weight: 600;
        color: #0f172a;
    }
    tr:nth-child(even) td {
        background-color: #f8fafc;
    }
    .img-box {
        text-align: center;
        margin: 12px 0;
    }
    .img-box img {
        max-width: 90%;
        max-height: 260px;
        border-radius: 4px;
        border: 1px solid #e2e8f0;
    }
    """

    html_parts = [f"<!DOCTYPE html><html><head><meta charset='utf-8'><style>{css}</style></head><body>"]

    # 3. Parse in sequential element order (paragraphs and tables)
    for element in doc.element.body:
        tag = element.tag.split("}")[-1]
        if tag == "p":
            p = docx.text.paragraph.Paragraph(element, doc)
            # Find embedded images in this paragraph
            p_imgs = []
            for r in p.runs:
                for blip in r._element.xpath(".//a:blip"):
                    embed_rId = blip.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed")
                    if embed_rId in images_by_rId:
                        p_imgs.append(images_by_rId[embed_rId])

            # Format text runs
            run_htmls = []
            for r in p.runs:
                r_txt = html.escape(r.text)
                if not r_txt:
                    continue
                if r.bold and r.italic:
                    r_txt = f"<strong><em>{r_txt}</em></strong>"
                elif r.bold:
                    r_txt = f"<strong>{r_txt}</strong>"
                elif r.italic:
                    r_txt = f"<em>{r_txt}</em>"
                if r.underline:
                    r_txt = f"<u>{r_txt}</u>"
                run_htmls.append(r_txt)

            p_content = "".join(run_htmls)
            style_name = p.style.name if p.style else ""

            if p_content:
                if style_name.startswith("Heading 1") or style_name == "Title":
                    html_parts.append(f"<h1>{p_content}</h1>")
                elif style_name.startswith("Heading 2"):
                    html_parts.append(f"<h2>{p_content}</h2>")
                elif style_name.startswith("Heading 3"):
                    html_parts.append(f"<h3>{p_content}</h3>")
                elif "List" in style_name:
                    html_parts.append(f"<div class='list-item'>{p_content}</div>")
                else:
                    html_parts.append(f"<p>{p_content}</p>")

            for img_data in p_imgs:
                html_parts.append(f"<div class='img-box'><img src='{img_data}' /></div>")

        elif tag == "tbl":
            tbl = docx.table.Table(element, doc)
            html_parts.append("<table>")
            for r_idx, row in enumerate(tbl.rows):
                html_parts.append("<tr>")
                for cell in row.cells:
                    cell_tag = "th" if r_idx == 0 else "td"
                    cell_html = html.escape(cell.text.strip())
                    html_parts.append(f"<{cell_tag}>{cell_html}</{cell_tag}>")
                html_parts.append("</tr>")
            html_parts.append("</table>")

    html_parts.append("</body></html>")
    return "\n".join(html_parts)


def generate_docx_pdf_preview(docx_path, output_pdf_path):
    """
    Renders a DOCX file into a multi-page PDF preview file at output_pdf_path.
    Uses an atomic temporary file write and rename to avoid serving partial files.
    """
    full_html = docx_to_html_representation(docx_path)

    temp_dir = os.path.dirname(os.path.abspath(output_pdf_path))
    os.makedirs(temp_dir, exist_ok=True)
    temp_fd, temp_path = tempfile.mkstemp(prefix="preview_tmp_", suffix=".pdf", dir=temp_dir)
    os.close(temp_fd)

    try:
        story = pymupdf.Story(html=full_html)
        writer = pymupdf.DocumentWriter(temp_path)
        page_rect = pymupdf.Rect(0, 0, 595.28, 841.89)       # A4
        content_rect = pymupdf.Rect(40, 48, 555.28, 793.89)  # Printable content area

        page_count = 0
        more = 1
        while more:
            device = writer.begin_page(page_rect)
            more, _ = story.place(content_rect)
            story.draw(device)
            writer.end_page()
            page_count += 1
            if page_count > 300:
                break

        writer.close()
        del writer

        if os.path.exists(output_pdf_path):
            try:
                os.remove(output_pdf_path)
            except Exception:
                pass
        os.replace(temp_path, output_pdf_path)
        return page_count
    except Exception as e:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
        raise e


# ==============================================================================
# POWERPOINT (PPT / PPTX) PREVIEW RENDERING
# ==============================================================================

def find_libreoffice_binary():
    """
    Discovers the LibreOffice headless executable across platforms:
    - Linux / Ubuntu / Docker: `soffice`, `libreoffice` in PATH or `/usr/bin/`
    - Windows: `soffice.exe` in Program Files
    - macOS: `/Applications/LibreOffice.app/Contents/MacOS/soffice`
    """
    # 1. System PATH
    for cmd in ["soffice", "libreoffice"]:
        path = shutil.which(cmd)
        if path:
            return path

    # 2. Standard Linux / Unix paths
    standard_unix_paths = [
        "/usr/bin/soffice",
        "/usr/bin/libreoffice",
        "/usr/local/bin/soffice",
        "/usr/local/bin/libreoffice",
        "/opt/libreoffice/program/soffice",
    ]
    for p in standard_unix_paths:
        if os.path.exists(p) and os.access(p, os.X_OK):
            return p

    # 3. Windows standard installation locations
    standard_windows_paths = [
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
        r"C:\Program Files\OpenOffice 4\program\soffice.exe",
    ]
    for p in standard_windows_paths:
        if os.path.exists(p):
            return p

    # 4. macOS
    mac_path = "/Applications/LibreOffice.app/Contents/MacOS/soffice"
    if os.path.exists(mac_path):
        return mac_path

    return None


def convert_presentation_via_libreoffice(source_path, output_pdf_path, timeout=60):
    """
    Converts a presentation file (.ppt or .pptx) directly to PDF using LibreOffice Headless.
    Returns True if successfully converted, False if LibreOffice is unavailable or conversion failed.
    """
    soffice_bin = find_libreoffice_binary()
    if not soffice_bin:
        return False

    temp_out_dir = tempfile.mkdtemp(prefix="lo_convert_")
    try:
        # LibreOffice headless command:
        # soffice --headless --invisible --nodefault --nofirststartwizard --convert-to pdf:writer_pdf_Export --outdir <dir> <source>
        # Note: for impress presentations, --convert-to pdf automatically uses the Impress PDF export filter.
        cmd = [
            soffice_bin,
            "--headless",
            "--invisible",
            "--nodefault",
            "--nofirststartwizard",
            "--convert-to",
            "pdf",
            "--outdir",
            temp_out_dir,
            source_path,
        ]

        logger.info("Executing LibreOffice headless conversion: %s", " ".join(cmd))
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )

        if proc.returncode != 0:
            logger.warning(
                "LibreOffice conversion exited with code %s: %s",
                proc.returncode,
                proc.stderr.decode("utf-8", errors="ignore"),
            )
            return False

        # Locate converted PDF in output directory
        base_name = os.path.splitext(os.path.basename(source_path))[0]
        expected_pdf = os.path.join(temp_out_dir, f"{base_name}.pdf")

        if not os.path.exists(expected_pdf):
            # Sometimes LibreOffice names output based on sanitized names; search directory
            pdf_candidates = [os.path.join(temp_out_dir, f) for f in os.listdir(temp_out_dir) if f.lower().endswith(".pdf")]
            if pdf_candidates:
                expected_pdf = pdf_candidates[0]
            else:
                logger.warning("LibreOffice produced no PDF output in %s", temp_out_dir)
                return False

        # Move to final preview destination atomically
        if os.path.exists(output_pdf_path):
            try:
                os.remove(output_pdf_path)
            except Exception:
                pass
        shutil.move(expected_pdf, output_pdf_path)
        return True

    except subprocess.TimeoutExpired:
        logger.error("LibreOffice conversion timed out after %s seconds for %s", timeout, source_path)
        return False
    except Exception as e:
        logger.warning("LibreOffice conversion failed for %s: %s", source_path, e)
        return False
    finally:
        shutil.rmtree(temp_out_dir, ignore_errors=True)


def convert_pptx_via_python_pptx(pptx_path, output_pdf_path):
    """
    Pure-Python fallback slide renderer for .pptx files using `python-pptx` and `pymupdf`.
    Operates without LibreOffice or any system binaries.
    Renders slides onto 16:9 widescreen or 4:3 PDF landscape pages with:
    - Slide titles and subtitles
    - Bulleted text and paragraph hierarchy
    - Tables (headers, rows, cells)
    - Embedded images
    - Clean slide borders, headers, and slide numbers
    """
    from pptx import Presentation

    prs = Presentation(pptx_path)

    # Determine slide aspect ratio
    slide_w_pt = prs.slide_width.pt if hasattr(prs, "slide_width") else 960
    slide_h_pt = prs.slide_height.pt if hasattr(prs, "slide_height") else 540

    # Ensure landscape PDF page dimensions (minimum 720x540)
    page_width = max(slide_w_pt, 720.0)
    page_height = max(slide_h_pt, 405.0)

    # Temporary file for atomic write
    temp_dir = os.path.dirname(os.path.abspath(output_pdf_path))
    os.makedirs(temp_dir, exist_ok=True)
    temp_fd, temp_path = tempfile.mkstemp(prefix="pptx_tmp_", suffix=".pdf", dir=temp_dir)
    os.close(temp_fd)

    try:
        pdf_doc = pymupdf.open()

        for slide_index, slide in enumerate(prs.slides):
            # Create a landscape slide page
            page = pdf_doc.new_page(width=page_width, height=page_height)

            # Slide frame and background styling
            # Light subtle slide border
            page.draw_rect(
                pymupdf.Rect(12, 12, page_width - 12, page_height - 12),
                color=(0.85, 0.88, 0.92),
                width=1,
            )

            # Slide header bar
            page.draw_rect(
                pymupdf.Rect(12, 12, page_width - 12, 40),
                color=None,
                fill=(0.95, 0.96, 0.98),
            )

            # Slide number tag
            page.insert_text(
                pymupdf.Point(page_width - 80, 28),
                f"Slide {slide_index + 1} / {len(prs.slides)}",
                fontsize=9,
                fontname="helv",
                color=(0.4, 0.45, 0.55),
            )

            # Extract slide elements
            title_text = ""
            if slide.shapes.title and slide.shapes.title.text:
                title_text = slide.shapes.title.text.strip()
                page.insert_text(
                    pymupdf.Point(28, 28),
                    title_text[:85] + ("..." if len(title_text) > 85 else ""),
                    fontsize=12,
                    fontname="hebo",
                    color=(0.09, 0.13, 0.2),
                )

            current_y = 65.0
            left_margin = 35.0
            content_width = page_width - (left_margin * 2)

            for shape in slide.shapes:
                # Skip title as it's already rendered in the top header
                if shape == slide.shapes.title:
                    continue

                # 1. Text boxes / Shapes with text
                if shape.has_text_frame:
                    tf = shape.text_frame
                    paragraphs = [p for p in tf.paragraphs if p.text.strip()]
                    if not paragraphs:
                        continue

                    for p in paragraphs:
                        p_text = p.text.strip()
                        if not p_text:
                            continue

                        level = getattr(p, "level", 0) or 0
                        indent = min(level * 18.0, 54.0)
                        bullet_prefix = "• " if level > 0 or len(paragraphs) > 1 else ""

                        # Font size adaptation
                        fontsize = 12 if level == 0 else 10.5
                        is_bold = any(run.font.bold for run in p.runs if run.font)

                        # Wrap and insert text
                        rect = pymupdf.Rect(left_margin + indent, current_y, left_margin + content_width, current_y + 30)
                        rc = page.insert_textbox(
                            rect,
                            f"{bullet_prefix}{p_text}",
                            fontsize=fontsize,
                            fontname="hebo" if is_bold else "helv",
                            color=(0.12, 0.16, 0.22),
                        )
                        # Estimate advance in Y
                        line_count = max(1, len(p_text) // 65 + 1)
                        current_y += (line_count * (fontsize + 4)) + 4

                        if current_y > page_height - 45:
                            break

                # 2. Tables
                elif shape.has_table:
                    table = shape.table
                    rows_count = len(table.rows)
                    cols_count = len(table.columns)
                    if rows_count == 0 or cols_count == 0:
                        continue

                    col_w = min(content_width / cols_count, 180.0)
                    tbl_top = current_y + 6
                    row_h = 22.0

                    for r_idx, row in enumerate(table.rows):
                        if tbl_top + (r_idx * row_h) > page_height - 35:
                            break
                        for c_idx, cell in enumerate(row.cells):
                            cell_rect = pymupdf.Rect(
                                left_margin + (c_idx * col_w),
                                tbl_top + (r_idx * row_h),
                                left_margin + ((c_idx + 1) * col_w),
                                tbl_top + ((r_idx + 1) * row_h),
                            )
                            # Cell border & background
                            bg_color = (0.94, 0.96, 0.98) if r_idx == 0 else (1.0, 1.0, 1.0)
                            page.draw_rect(cell_rect, color=(0.8, 0.85, 0.9), fill=bg_color, width=0.75)
                            cell_text = cell.text.strip()
                            page.insert_textbox(
                                cell_rect + (4, 4, -4, -4),
                                cell_text,
                                fontsize=9,
                                fontname="hebo" if r_idx == 0 else "helv",
                                color=(0.1, 0.1, 0.1),
                            )
                    current_y = tbl_top + (min(rows_count, 8) * row_h) + 12

                # 3. Embedded Images / Pictures
                elif shape.shape_type == 13:  # MSO_SHAPE_TYPE.PICTURE = 13
                    try:
                        image = shape.image
                        image_bytes = image.blob
                        img_rect = pymupdf.Rect(
                            left_margin,
                            current_y + 6,
                            min(left_margin + 260.0, page_width - 40),
                            min(current_y + 180.0, page_height - 30),
                        )
                        page.insert_image(img_rect, stream=image_bytes)
                        current_y += 190.0
                    except Exception as img_err:
                        logger.debug("Could not render embedded pptx image: %s", img_err)

                if current_y > page_height - 40:
                    break

        pdf_doc.save(temp_path, garbage=4, deflate=True)
        pdf_doc.close()

        if os.path.exists(output_pdf_path):
            try:
                os.remove(output_pdf_path)
            except Exception:
                pass
        os.replace(temp_path, output_pdf_path)
        return len(prs.slides)

    except Exception as e:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
        raise e


def generate_presentation_pdf_preview(presentation_path, output_pdf_path):
    """
    Converts a presentation file (.ppt or .pptx) to PDF.
    Pipeline:
    1. Try LibreOffice Headless (highest visual fidelity, works for both .ppt and .pptx).
    2. If LibreOffice is not available or fails, and file is .pptx, use pure-Python `python-pptx` fallback.
    3. If neither succeeds, raise RuntimeError.
    """
    # 1. Try LibreOffice Headless
    success = convert_presentation_via_libreoffice(presentation_path, output_pdf_path)
    if success and os.path.exists(output_pdf_path) and os.path.getsize(output_pdf_path) > 0:
        return output_pdf_path

    # 2. Fallback to pure-Python for .pptx files
    is_pptx = presentation_path.lower().endswith(".pptx")
    if is_pptx:
        try:
            logger.info("Falling back to pure-Python PPTX preview generator for %s", presentation_path)
            convert_pptx_via_python_pptx(presentation_path, output_pdf_path)
            if os.path.exists(output_pdf_path) and os.path.getsize(output_pdf_path) > 0:
                return output_pdf_path
        except Exception as e:
            logger.error("Python PPTX fallback conversion failed for %s: %s", presentation_path, e)

    # 3. If file is .ppt and LibreOffice was not available
    if not is_pptx:
        raise RuntimeError(
            "Legacy .ppt conversion requires LibreOffice Headless on the server. "
            "Please ensure LibreOffice is installed or convert the presentation to .pptx format."
        )

    raise RuntimeError("PowerPoint presentation preview generation failed.")


# ==============================================================================
# CACHED PREVIEW RETRIEVAL DISPATCHER
# ==============================================================================

def get_or_create_docx_preview(training_file):
    """
    Retrieves or generates the cached PDF preview for a DOCX TrainingFile.
    Compatible with both local filesystem storage and remote S3 storage.
    """
    if not training_file.file:
        raise FileNotFoundError("The document file record has no attached file.")

    ensure_previews_dir()

    try:
        if hasattr(training_file.file, "path") and os.path.exists(training_file.file.path):
            docx_source_path = training_file.file.path
            content_hash = get_file_content_hash(docx_source_path)
            is_local = True
        else:
            docx_source_path = None
            content_hash = hashlib.sha256(f"{training_file.file.name}_{training_file.file_size}".encode("utf-8")).hexdigest()
            is_local = False
    except NotImplementedError:
        docx_source_path = None
        content_hash = hashlib.sha256(f"{training_file.file.name}_{training_file.file_size}".encode("utf-8")).hexdigest()
        is_local = False

    preview_filename = f"preview_docx_{training_file.id}_{content_hash[:16]}.pdf"
    preview_path = os.path.join(PREVIEWS_DIR, preview_filename)

    # Cache hit check
    if os.path.exists(preview_path) and os.path.getsize(preview_path) > 0:
        return preview_path

    # Clean up older previews for this specific training_file ID
    try:
        prefix = f"preview_docx_{training_file.id}_"
        for old_file in os.listdir(PREVIEWS_DIR):
            if old_file.startswith(prefix) and old_file.endswith(".pdf"):
                try:
                    os.remove(os.path.join(PREVIEWS_DIR, old_file))
                except Exception:
                    pass
    except Exception as e:
        logger.debug("Failed cleaning old previews for file %s: %s", training_file.id, e)

    # Generate fresh preview
    if is_local and docx_source_path:
        generate_docx_pdf_preview(docx_source_path, preview_path)
    else:
        temp_docx = tempfile.NamedTemporaryFile(suffix=".docx", delete=False)
        try:
            with training_file.file.open("rb") as f_in:
                while True:
                    chunk = f_in.read(65536)
                    if not chunk:
                        break
                    temp_docx.write(chunk)
            temp_docx.close()
            generate_docx_pdf_preview(temp_docx.name, preview_path)
        finally:
            if os.path.exists(temp_docx.name):
                try:
                    os.remove(temp_docx.name)
                except Exception:
                    pass

    return preview_path


def get_or_create_presentation_preview(training_file):
    """
    Retrieves or generates the cached PDF preview for a PPT / PPTX TrainingFile.
    Compatible with both local filesystem storage and remote S3 storage.
    Returns:
        preview_pdf_path (str) pointing to a generated, valid PDF.
    Raises:
        FileNotFoundError, RuntimeError, or Exception if preview generation fails.
    """
    if not training_file.file:
        raise FileNotFoundError("The presentation file record has no attached file.")

    ensure_previews_dir()

    # Determine file extension (.pptx or .ppt)
    ext = os.path.splitext(training_file.filename)[1].lower()
    if ext not in [".pptx", ".ppt"]:
        ext = ".pptx" if (training_file.file_type and training_file.file_type.upper() == "PPTX") else ".ppt"

    try:
        if hasattr(training_file.file, "path") and os.path.exists(training_file.file.path):
            source_path = training_file.file.path
            content_hash = get_file_content_hash(source_path)
            is_local = True
        else:
            source_path = None
            content_hash = hashlib.sha256(f"{training_file.file.name}_{training_file.file_size}".encode("utf-8")).hexdigest()
            is_local = False
    except NotImplementedError:
        source_path = None
        content_hash = hashlib.sha256(f"{training_file.file.name}_{training_file.file_size}".encode("utf-8")).hexdigest()
        is_local = False

    preview_filename = f"preview_ppt_{training_file.id}_{content_hash[:16]}.pdf"
    preview_path = os.path.join(PREVIEWS_DIR, preview_filename)

    # Cache hit check
    if os.path.exists(preview_path) and os.path.getsize(preview_path) > 0:
        return preview_path

    # Clean up older previews for this specific training_file ID
    try:
        prefix = f"preview_ppt_{training_file.id}_"
        for old_file in os.listdir(PREVIEWS_DIR):
            if old_file.startswith(prefix) and old_file.endswith(".pdf"):
                try:
                    os.remove(os.path.join(PREVIEWS_DIR, old_file))
                except Exception:
                    pass
    except Exception as e:
        logger.debug("Failed cleaning old presentation previews for file %s: %s", training_file.id, e)

    # Generate fresh preview
    if is_local and source_path:
        generate_presentation_pdf_preview(source_path, preview_path)
    else:
        temp_ppt = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
        try:
            with training_file.file.open("rb") as f_in:
                while True:
                    chunk = f_in.read(65536)
                    if not chunk:
                        break
                    temp_ppt.write(chunk)
            temp_ppt.close()
            generate_presentation_pdf_preview(temp_ppt.name, preview_path)
        finally:
            if os.path.exists(temp_ppt.name):
                try:
                    os.remove(temp_ppt.name)
                except Exception:
                    pass

    return preview_path
