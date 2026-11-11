import io
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
        from core.models import Course, Module, Submodule, TrainingCluster, TrainingFileMapping, DocumentCategory
        course = Course.objects.create(name="Test Course", code="TEST-C1", order=99)
        mod = Module.objects.create(course=course, name="Test Mod", code="TMOD-1", order=1)
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
        from core.models import Course, Module, Submodule, TrainingCluster, TrainingFileMapping, DocumentCategory, AuditLog, AuditAction
        course = Course.objects.create(name="Delete Test Course", code="DEL-C1", order=98)
        mod = Module.objects.create(course=course, name="Delete Mod", code="DMOD-1", order=1)
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



