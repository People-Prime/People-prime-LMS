"""
Document Preview Generator for LMS Learning Materials.

Converts supported proprietary documents (e.g., DOCX) into clean, paginated,
read-only PDF representations for inline browser viewing.
Zero external system binaries, zero network or third-party web services.
Uses local `python-docx` and `pymupdf` packages.
"""

import base64
import hashlib
import html
import logging
import os
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

    # Temporary file for atomic write
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
            if page_count > 300:  # Safety guard for runaway documents
                break

        writer.close()
        del writer

        # Atomically replace final file
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


def get_or_create_docx_preview(training_file):
    """
    Retrieves or generates the cached PDF preview for a DOCX TrainingFile.
    Compatible with both local filesystem storage and remote S3 storage.
    Returns:
        preview_pdf_path (str) if successful.
    Raises:
        ValueError, FileNotFoundError, or Exception if conversion fails.
    """
    if not training_file.file:
        raise FileNotFoundError("The document file record has no attached file.")

    ensure_previews_dir()

    # Determine a reliable content hash. If on local disk, use file content hash;
    # if on remote S3 storage where .path is unsupported, hash the storage name + file_size.
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

    preview_filename = f"preview_{training_file.id}_{content_hash[:16]}.pdf"
    preview_path = os.path.join(PREVIEWS_DIR, preview_filename)

    # Cache hit check: if preview file exists and has non-zero size, reuse it
    if os.path.exists(preview_path) and os.path.getsize(preview_path) > 0:
        return preview_path

    # Clean up older previews for this specific training_file ID
    try:
        prefix = f"preview_{training_file.id}_"
        for old_file in os.listdir(PREVIEWS_DIR):
            if old_file.startswith(prefix) and old_file.endswith(".pdf"):
                old_path = os.path.join(PREVIEWS_DIR, old_file)
                try:
                    os.remove(old_path)
                except Exception:
                    pass
    except Exception as e:
        logger.debug("Failed cleaning old previews for file %s: %s", training_file.id, e)

    # Generate fresh preview
    if is_local and docx_source_path:
        generate_docx_pdf_preview(docx_source_path, preview_path)
    else:
        # Remote storage (e.g. AWS S3): Download to a temporary file, convert, and delete temp file
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
