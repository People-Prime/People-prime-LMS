import io
import os
import hashlib
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from core.models import TrainingFile


class TrainingFileAPITests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin_uploader",
            email="admin_uploader@test.com",
            password="adminpassword123",
            role=User.Role.ADMIN,
        )
        self.learner = User.objects.create_user(
            username="learner_user",
            email="learner@test.com",
            password="learnerpassword123",
            role=User.Role.LEARNER,
        )

    def test_admin_bulk_upload_with_relative_paths(self):
        self.client.force_authenticate(user=self.admin)
        content1 = b"Sample docx content 1"
        content2 = b"Sample pdf content 2"

        file1 = SimpleUploadedFile("test1.docx", content1, content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        file2 = SimpleUploadedFile("test2.pdf", content2, content_type="application/pdf")

        data = {
            "files": [file1, file2],
            "relative_paths": ["Module 1/test1.docx", "Full Time Hiring  VS C2H/test2.pdf"]
        }

        url = reverse("admin-training-files-upload-files")
        response = self.client.post(url, data, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["created_count"], 2)
        self.assertEqual(response.data["skipped_count"], 0)
        self.assertEqual(response.data["failed_count"], 0)

        # Verify DB records
        tf1 = TrainingFile.objects.get(filename="test1.docx")
        self.assertEqual(tf1.relative_path, "Module 1/test1.docx")
        self.assertEqual(tf1.file_type, "DOCX")
        self.assertEqual(tf1.checksum, hashlib.sha256(content1).hexdigest())

        tf2 = TrainingFile.objects.get(filename="test2.pdf")
        self.assertEqual(tf2.relative_path, "Full Time Hiring  VS C2H/test2.pdf")
        self.assertEqual(tf2.file_type, "PDF")

    def test_duplicate_upload_is_skipped(self):
        self.client.force_authenticate(user=self.admin)
        content = b"Duplicate test file"
        file_obj = SimpleUploadedFile("dup.docx", content)

        url = reverse("admin-training-files-upload-files")
        # First upload
        resp1 = self.client.post(url, {"files": [file_obj], "relative_paths": ["dup.docx"]}, format="multipart")
        self.assertEqual(resp1.data["created_count"], 1)

        # Second upload with identical content
        file_obj2 = SimpleUploadedFile("dup.docx", content)
        resp2 = self.client.post(url, {"files": [file_obj2], "relative_paths": ["dup.docx"]}, format="multipart")
        self.assertEqual(resp2.data["created_count"], 0)
        self.assertEqual(resp2.data["skipped_count"], 1)
        self.assertIn("Duplicate file already exists", resp2.data["skipped"][0]["reason"])

    def test_learner_access_forbidden(self):
        self.client.force_authenticate(user=self.learner)
        url = reverse("admin-training-files-list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        upload_url = reverse("admin-training-files-upload-files")
        file_obj = SimpleUploadedFile("sample.docx", b"data")
        resp_upload = self.client.post(upload_url, {"files": [file_obj]}, format="multipart")
        self.assertEqual(resp_upload.status_code, status.HTTP_403_FORBIDDEN)

    def test_download_streaming_by_admin(self):
        self.client.force_authenticate(user=self.admin)
        content = b"Downloadable content file"
        file_obj = SimpleUploadedFile("download_me.pdf", content, content_type="application/pdf")

        upload_url = reverse("admin-training-files-upload-files")
        resp = self.client.post(upload_url, {"files": [file_obj]}, format="multipart")
        tf_id = resp.data["created"][0]["id"]

        download_url = reverse("admin-training-files-download-file", kwargs={"pk": tf_id})
        dl_resp = self.client.get(download_url)
        self.assertEqual(dl_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(b"".join(dl_resp.streaming_content), content)

    def test_training_clusters_and_mappings_crud(self):
        from core.models import Course, CourseLevel, Module, Submodule, TrainingCluster, TrainingFileMapping, DocumentCategory
        course = Course.objects.create(name="Test Course", code="TEST-C1", order=99)
        level = CourseLevel.objects.create(course=course, name="Test Level", order=1)
        mod = Module.objects.create(course=course, level=level, name="Test Mod", order=1)
        sub = Submodule.objects.create(module=mod, name="Test Sub", order=1)

        # Upload file first
        self.client.force_authenticate(user=self.admin)
        f_obj = SimpleUploadedFile("cluster_test.docx", b"Content for cluster test")
        up_resp = self.client.post(reverse("admin-training-files-upload-files"), {"files": [f_obj]}, format="multipart")
        tf_id = up_resp.data["created"][0]["id"]

        # Admin create cluster
        clust_url = reverse("admin-training-clusters-list")
        c_resp = self.client.post(clust_url, {
            "course": course.id,
            "code": "T-CLUST-1",
            "name": "Test Cluster 1",
            "order": 1
        })
        self.assertEqual(c_resp.status_code, status.HTTP_201_CREATED)
        cluster_id = c_resp.data["id"]

        # Admin create mapping
        map_url = reverse("admin-training-file-mappings-list")
        m_resp = self.client.post(map_url, {
            "file_id": tf_id,
            "cluster": cluster_id,
            "module": mod.id,
            "submodule": sub.id,
            "category": DocumentCategory.PRIMARY_INSTRUCTIONAL,
            "notes": "Test mapping note"
        })
        self.assertEqual(m_resp.status_code, status.HTTP_201_CREATED)
        mapping_id = m_resp.data["id"]

        # Learner cannot access clusters or mappings
        self.client.force_authenticate(user=self.learner)
        self.assertEqual(self.client.get(clust_url).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(map_url).status_code, status.HTTP_403_FORBIDDEN)

        # Admin delete mapping does not delete the physical file
        self.client.force_authenticate(user=self.admin)
        del_resp = self.client.delete(reverse("admin-training-file-mappings-detail", kwargs={"pk": mapping_id}))
        self.assertEqual(del_resp.status_code, status.HTTP_204_NO_CONTENT)

        # Verify TrainingFile still exists
        from core.models import TrainingFile
        self.assertTrue(TrainingFile.objects.filter(id=tf_id).exists())

    def test_admin_safe_delete_training_file_with_mappings(self):
        import os
        from core.models import Course, CourseLevel, Module, Submodule, TrainingCluster, TrainingFileMapping, DocumentCategory, AuditLog, AuditAction
        course = Course.objects.create(name="Delete Test Course", code="DEL-C1", order=98)
        level = CourseLevel.objects.create(course=course, name="Delete Test Level", order=1)
        mod = Module.objects.create(course=course, level=level, name="Delete Mod", order=1)
        sub = Submodule.objects.create(module=mod, name="Delete Sub", order=1)

        # Upload file
        self.client.force_authenticate(user=self.admin)
        f_obj = SimpleUploadedFile("deletable_doc.docx", b"Content to be deleted safely")
        up_resp = self.client.post(reverse("admin-training-files-upload-files"), {"files": [f_obj]}, format="multipart")
        tf_id = up_resp.data["created"][0]["id"]
        tf = TrainingFile.objects.get(id=tf_id)
        file_disk_path = tf.file.path

        # Create cluster & 2 mappings
        clust = TrainingCluster.objects.create(course=course, name="Delete Cluster", code="DEL-CLUST-1", order=1)
        map1 = TrainingFileMapping.objects.create(training_file=tf, cluster=clust, module=mod, submodule=sub)
        map2 = TrainingFileMapping.objects.create(training_file=tf, cluster=clust, module=mod)

        # 1. Unauthenticated or learner request should fail with 403
        self.client.force_authenticate(user=self.learner)
        del_url = reverse("admin-training-files-detail", kwargs={"pk": tf_id})
        resp_learner = self.client.delete(del_url)
        self.assertEqual(resp_learner.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(TrainingFile.objects.filter(id=tf_id).exists())

        # 2. Admin deletion succeeds, removes mappings and physical file
        self.client.force_authenticate(user=self.admin)
        resp_admin = self.client.delete(del_url)
        self.assertEqual(resp_admin.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_admin.data["mappings_removed"], 2)

        # Verify DB records deleted
        self.assertFalse(TrainingFile.objects.filter(id=tf_id).exists())
        self.assertFalse(TrainingFileMapping.objects.filter(id=map1.id).exists())
        self.assertFalse(TrainingFileMapping.objects.filter(id=map2.id).exists())

        # Verify physical file deleted from storage
        self.assertFalse(os.path.exists(file_disk_path))

        # Verify AuditLog created
        audit_entry = AuditLog.objects.filter(
            action=AuditAction.DELETE,
            entity_type="TrainingFile",
            entity_id=str(tf_id),
        ).first()
        self.assertIsNotNone(audit_entry)
        self.assertEqual(audit_entry.details.get("mappings_removed"), 2)

    def test_batch_upload_per_file_tracking_and_diagnostics(self):
        """
        Verify that batch uploads return individual, rich diagnostics for:
        - Successful uploads
        - Duplicates with existing ID and reason
        - Failed files with specific error categories (e.g. UNSUPPORTED_FORMAT)
        """
        self.client.force_authenticate(user=self.admin)

        # 1. First upload an existing file to establish a duplicate candidate
        initial_file = SimpleUploadedFile("existing_doc.docx", b"Existing docx content")
        up_init = self.client.post(
            reverse("admin-training-files-upload-files"),
            {"files": [initial_file], "relative_paths": ["Docs/existing_doc.docx"]},
            format="multipart"
        )
        self.assertEqual(up_init.status_code, status.HTTP_201_CREATED)
        existing_id = up_init.data["created"][0]["id"]

        # 2. Formulate a mixed batch:
        # File A: Valid new file (Should succeed)
        # File B: Duplicate content of existing_doc.docx (Should be skipped with diagnostics)
        # File C: Unsupported format .exe (Should fail with category UNSUPPORTED_FORMAT)
        file_valid = SimpleUploadedFile("new_guide.pdf", b"New guide content", content_type="application/pdf")
        file_dup = SimpleUploadedFile("duplicate_copy.docx", b"Existing docx content", content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        file_invalid = SimpleUploadedFile("dangerous.exe", b"binary executable", content_type="application/octet-stream")

        mixed_data = {
            "files": [file_valid, file_dup, file_invalid],
            "relative_paths": ["Guides/new_guide.pdf", "Docs/duplicate_copy.docx", "Tools/dangerous.exe"]
        }

        resp = self.client.post(
            reverse("admin-training-files-upload-files"),
            mixed_data,
            format="multipart"
        )

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["total_processed"], 3)
        self.assertEqual(resp.data["created_count"], 1)
        self.assertEqual(resp.data["skipped_count"], 1)
        self.assertEqual(resp.data["failed_count"], 1)

        # Reconcile counts
        self.assertEqual(len(resp.data["created"]), 1)
        self.assertEqual(len(resp.data["skipped"]), 1)
        self.assertEqual(len(resp.data["failed"]), 1)

        # Check Created File Diagnostics
        created_item = resp.data["created"][0]
        self.assertEqual(created_item["filename"], "new_guide.pdf")
        self.assertEqual(created_item["relative_path"], "Guides/new_guide.pdf")
        self.assertEqual(created_item["original_filename"], "new_guide.pdf")
        self.assertGreater(created_item["file_size"], 0)

        # Check Duplicate File Diagnostics
        dup_item = resp.data["skipped"][0]
        self.assertEqual(dup_item["filename"], "duplicate_copy.docx")
        self.assertEqual(dup_item["original_filename"], "duplicate_copy.docx")
        self.assertEqual(dup_item["existing_id"], existing_id)
        self.assertIn("Exact identical content already exists", dup_item["reason"])

        # Check Failed File Diagnostics
        failed_item = resp.data["failed"][0]
        self.assertEqual(failed_item["filename"], "dangerous.exe")
        self.assertEqual(failed_item["category"], "UNSUPPORTED_FORMAT")
        self.assertIn("Unsupported file extension", failed_item["error"])
        self.assertFalse(failed_item["retry_eligible"])

    def test_retry_failed_file_succeeds_without_duplicating_others(self):
        """
        Verify that a corrected file can be uploaded individually or retried
        without creating duplicate repository records.
        """
        self.client.force_authenticate(user=self.admin)

        # Attempt to upload corrected version of a file
        valid_file = SimpleUploadedFile("recovered_file.docx", b"Corrected valid content")
        retry_resp = self.client.post(
            reverse("admin-training-files-upload-files"),
            {"files": [valid_file], "relative_paths": ["Recovered/recovered_file.docx"]},
            format="multipart"
        )

        self.assertEqual(retry_resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(retry_resp.data["created_count"], 1)
        self.assertEqual(retry_resp.data["failed_count"], 0)

    def test_os_metadata_files_are_automatically_ignored_without_failing(self):
        """
        Verify that OS metadata artifacts (desktop.ini, Thumbs.db, .DS_Store, __MACOSX, ._*)
        are detected and classified as ignored metadata, not failures.
        Legitimate PDF and DOCX files in the same batch must upload successfully.
        """
        self.client.force_authenticate(user=self.admin)

        file_pdf = SimpleUploadedFile("guide.pdf", b"Valid PDF material content", content_type="application/pdf")
        file_docx = SimpleUploadedFile("notes.docx", b"Valid DOCX material content", content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        file_ds_store = SimpleUploadedFile(".DS_Store", b"\x00\x00\x00\x01Bud1", content_type="application/octet-stream")
        file_thumbs = SimpleUploadedFile("Thumbs.db", b"fake binary thumbnail cache", content_type="application/octet-stream")
        file_desktop_ini = SimpleUploadedFile("desktop.ini", b"[.ShellClassInfo]\r\nIconResource=...", content_type="text/plain")
        file_appledouble = SimpleUploadedFile("._notes.docx", b"AppleDouble binary header", content_type="application/octet-stream")
        file_macosx_sub = SimpleUploadedFile("icon.png", b"fake macosx resource", content_type="image/png")

        data = {
            "files": [
                file_pdf,
                file_docx,
                file_ds_store,
                file_thumbs,
                file_desktop_ini,
                file_appledouble,
                file_macosx_sub,
            ],
            "relative_paths": [
                "Modules/guide.pdf",
                "Modules/notes.docx",
                "Modules/.DS_Store",
                "Modules/Thumbs.db",
                "Modules/desktop.ini",
                "Modules/._notes.docx",
                "__MACOSX/Modules/icon.png",
            ]
        }

        resp = self.client.post(reverse("admin-training-files-upload-files"), data, format="multipart")

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["total_processed"], 7)
        self.assertEqual(resp.data["created_count"], 2)   # guide.pdf and notes.docx
        self.assertEqual(resp.data["ignored_count"], 5)   # 5 OS metadata files
        self.assertEqual(resp.data["failed_count"], 0)    # ZERO failures
        self.assertEqual(resp.data["skipped_count"], 0)

        # Check ignored details
        ignored_names = [f["filename"] for f in resp.data["ignored"]]
        self.assertIn(".DS_Store", ignored_names)
        self.assertIn("Thumbs.db", ignored_names)
        self.assertIn("desktop.ini", ignored_names)
        self.assertIn("._notes.docx", ignored_names)
        self.assertIn("icon.png", ignored_names)

        # Verify only legitimate files are stored in DB
        self.assertTrue(TrainingFile.objects.filter(filename="guide.pdf").exists())
        self.assertTrue(TrainingFile.objects.filter(filename="notes.docx").exists())
        self.assertFalse(TrainingFile.objects.filter(filename=".DS_Store").exists())
        self.assertFalse(TrainingFile.objects.filter(filename="desktop.ini").exists())

    def test_bulk_deletion_of_training_files_with_mappings_and_storage(self):
        """
        Verify the bulk-delete action:
        - Deletes multiple selected files by ID
        - Cleans up associated TrainingFileMapping records
        - Cleans up disk storage for each file
        - Logs AuditLog entries
        - Handles missing IDs and returns reconciled counts
        """
        from core.models import Course, CourseLevel, Module, Submodule, TrainingCluster, TrainingFileMapping, DocumentCategory

        self.client.force_authenticate(user=self.admin)

        # 1. Setup course, module, cluster
        course = Course.objects.create(name="Bulk Del Course", code="BD-C1", order=88)
        level = CourseLevel.objects.create(course=course, name="BD Level", order=1)
        mod = Module.objects.create(course=course, level=level, name="BD Module", order=1)
        clust = TrainingCluster.objects.create(course=course, code="BD-CLUST-1", name="BD Cluster", order=1)

        # 2. Upload 3 files
        f1 = SimpleUploadedFile("bulk_target_1.pdf", b"Content 1", content_type="application/pdf")
        f2 = SimpleUploadedFile("bulk_target_2.docx", b"Content 2", content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        f3 = SimpleUploadedFile("bulk_target_3.png", b"Content 3", content_type="image/png")

        up_resp = self.client.post(
            reverse("admin-training-files-upload-files"),
            {"files": [f1, f2, f3]},
            format="multipart"
        )
        self.assertEqual(up_resp.data["created_count"], 3)
        id1 = up_resp.data["created"][0]["id"]
        id2 = up_resp.data["created"][1]["id"]
        id3 = up_resp.data["created"][2]["id"]

        # Map id1 and id2 to curriculum
        map1 = TrainingFileMapping.objects.create(training_file_id=id1, cluster=clust, category=DocumentCategory.PRIMARY_INSTRUCTIONAL)
        map2 = TrainingFileMapping.objects.create(training_file_id=id2, module=mod, category=DocumentCategory.SUPPLEMENTARY_REFERENCE)

        # Get file storage paths
        path1 = TrainingFile.objects.get(id=id1).file.path
        path2 = TrainingFile.objects.get(id=id2).file.path
        path3 = TrainingFile.objects.get(id=id3).file.path

        self.assertTrue(os.path.exists(path1))
        self.assertTrue(os.path.exists(path2))
        self.assertTrue(os.path.exists(path3))

        # 3. Learner cannot perform bulk delete
        self.client.force_authenticate(user=self.learner)
        learner_resp = self.client.post(
            reverse("admin-training-files-bulk-destroy"),
            {"ids": [id1, id2]},
            format="json"
        )
        self.assertEqual(learner_resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(TrainingFile.objects.filter(id=id1).exists())

        # 4. Admin performs bulk delete including a nonexistent ID (e.g. 99999)
        self.client.force_authenticate(user=self.admin)
        admin_resp = self.client.post(
            reverse("admin-training-files-bulk-destroy"),
            {"ids": [id1, id2, 99999]},
            format="json"
        )

        self.assertEqual(admin_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(admin_resp.data["deleted_count"], 2)
        self.assertEqual(admin_resp.data["failed_count"], 0)
        self.assertEqual(admin_resp.data["not_found_count"], 1)
        self.assertIn(99999, admin_resp.data["not_found"])
        self.assertEqual(admin_resp.data["total_mappings_removed"], 2)

        # Verify DB records deleted
        self.assertFalse(TrainingFile.objects.filter(id=id1).exists())
        self.assertFalse(TrainingFile.objects.filter(id=id2).exists())
        self.assertTrue(TrainingFile.objects.filter(id=id3).exists()) # untouched
        self.assertFalse(TrainingFileMapping.objects.filter(id=map1.id).exists())
        self.assertFalse(TrainingFileMapping.objects.filter(id=map2.id).exists())

        # Verify disk files removed
        self.assertFalse(os.path.exists(path1))
        self.assertFalse(os.path.exists(path2))
        self.assertTrue(os.path.exists(path3))

    def test_is_os_metadata_file_comprehensive(self):
        """
        Tests the is_os_metadata_file validator against required OS metadata files and ordinary files:
        - .Trash-1000
        - .Trashes
        - __MACOSX
        - .DS_Store
        - ._filename
        - desktop.ini
        - Thumbs.db
        - Ordinary valid training materials
        """
        from core.validators import is_os_metadata_file

        # 1. Metadata files and paths that should be detected as True
        metadata_paths = [
            ".Trash-1000/some_deleted_file.pdf",
            ".trash-501/doc.docx",
            "folder/.Trash-1000",
            ".Trash-1000",
            ".Trashes/501/lost.pdf",
            ".trashes",
            "__MACOSX/._sample.pdf",
            "course_materials/__macosx/notes.docx",
            ".DS_Store",
            "Curriculum/Module 1/.ds_store",
            "._lecture_notes.pdf",
            "Level 2/._syllabus.docx",
            "desktop.ini",
            "Windows/System/desktop.ini",
            "Thumbs.db",
            "images/thumbs.db",
            "ehthumbs.db",
            ".localized",
            ".directory",
        ]
        for path in metadata_paths:
            with self.subTest(path=path):
                self.assertTrue(is_os_metadata_file(path), f"Expected True for: {path}")

        # 2. Ordinary legitimate files that should NOT be detected as metadata (False)
        legitimate_paths = [
            "Module 1/Lecture_Notes.pdf",
            " फुल_टाइम_Hiring.docx",
            "Project_Guide.pdf",
            "trash_collection_policy.pdf",
            "trash.docx",
            "macosx_architecture_diagram.png",
            "desktop_publishing_guide.pptx",
            "thumbnail_design_overview.pdf",
            "store_inventory_management.xlsx",
            "level1/module2/content.pdf",
        ]
        for path in legitimate_paths:
            with self.subTest(path=path):
                self.assertFalse(is_os_metadata_file(path), f"Expected False for: {path}")

    def test_upload_identical_filenames_in_separate_directories(self):
        """
        Verify that files sharing identical filenames in distinct relative directories
        with distinct contents are correctly ingested and disambiguated.
        """
        self.client.force_authenticate(user=self.admin)
        f1 = SimpleUploadedFile("readme.txt", b"Directory 1 content", content_type="text/plain")
        f2 = SimpleUploadedFile("readme.txt", b"Directory 2 different content", content_type="text/plain")

        data = {
            "files": [f1, f2],
            "relative_paths": ["Module_A/readme.txt", "Module_B/readme.txt"]
        }
        res = self.client.post(reverse("admin-training-files-upload-files"), data, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["created_count"], 2)
        self.assertEqual(res.data["skipped_count"], 0)

        # Confirm distinct DB records and paths
        tf_a = TrainingFile.objects.get(relative_path="Module_A/readme.txt")
        tf_b = TrainingFile.objects.get(relative_path="Module_B/readme.txt")
        self.assertNotEqual(tf_a.id, tf_b.id)
        self.assertEqual(tf_a.filename, "readme.txt")
        self.assertEqual(tf_b.filename, "readme.txt")
        self.assertNotEqual(tf_a.checksum, tf_b.checksum)

    def test_bulk_destroy_partial_failure_response(self):
        """
        Verify bulk destroy properly separates deleted, failed, and not_found lists
        when simulated database error or exception occurs on one item.
        """
        self.client.force_authenticate(user=self.admin)
        f1 = SimpleUploadedFile("delete_ok.pdf", b"Content OK", content_type="application/pdf")
        f2 = SimpleUploadedFile("delete_fail.pdf", b"Content Fail", content_type="application/pdf")

        up_resp = self.client.post(
            reverse("admin-training-files-upload-files"),
            {"files": [f1, f2]},
            format="multipart"
        )
        id_ok = up_resp.data["created"][0]["id"]
        id_fail = up_resp.data["created"][1]["id"]

        from unittest.mock import patch

        # Mock delete() on id_fail to simulate partial failure
        original_delete = TrainingFile.delete

        def custom_delete(self_obj, *args, **kwargs):
            if self_obj.id == id_fail:
                raise Exception("Simulated DB Lock / ProtectedForeign constraint error")
            return original_delete(self_obj, *args, **kwargs)

        with patch.object(TrainingFile, "delete", custom_delete):
            resp = self.client.post(
                reverse("admin-training-files-bulk-destroy"),
                {"ids": [id_ok, id_fail, 88888]},
                format="json"
            )

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["deleted_count"], 1)
        self.assertEqual(resp.data["failed_count"], 1)
        self.assertEqual(resp.data["not_found_count"], 1)

        self.assertEqual(resp.data["deleted"][0]["id"], id_ok)
        self.assertEqual(resp.data["failed"][0]["id"], id_fail)
        self.assertIn("Simulated DB Lock", resp.data["failed"][0]["error"])
        self.assertIn(88888, resp.data["not_found"])

        # Check DB states
        self.assertFalse(TrainingFile.objects.filter(id=id_ok).exists())
        self.assertTrue(TrainingFile.objects.filter(id=id_fail).exists())
