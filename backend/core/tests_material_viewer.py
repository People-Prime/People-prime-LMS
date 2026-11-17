from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from core.models import Course, CourseLevel, Module, Submodule, TrainingFile, TrainingFileMapping, TrainingCluster, TrainingAssignment, PublicationStatus

User = get_user_model()

class ModuleMaterialViewerAPITest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username='admin_u', password='pw', role=User.Role.ADMIN)
        self.trainer = User.objects.create_user(username='trainer_u', password='pw', role=User.Role.TRAINER)
        self.learner = User.objects.create_user(username='learner_u', password='pw', role=User.Role.LEARNER)
        self.unassigned_learner = User.objects.create_user(username='unassigned_u', password='pw', role=User.Role.LEARNER)

        self.course = Course.objects.create(name='Test Course', code='TC01', status=PublicationStatus.PUBLISHED)
        self.level = CourseLevel.objects.create(name='Level 1', course=self.course, order=1)
        self.cluster = TrainingCluster.objects.create(course=self.course, name='Cluster 1', code='CL01', order=1)
        self.module = Module.objects.create(course=self.course, level=self.level, name='Test Module', order=1, status=PublicationStatus.PUBLISHED)
        self.submodule = Submodule.objects.create(module=self.module, name='Lesson 1', order=1, status=PublicationStatus.PUBLISHED)

        # Create training file using SimpleUploadedFile so it properly lives in media storage
        dummy_pdf = SimpleUploadedFile("document1.pdf", b"%PDF-1.4 test dummy pdf content", content_type="application/pdf")
        self.tf_doc = TrainingFile.objects.create(
            file=dummy_pdf,
            filename='document1.pdf',
            file_type='PDF',
            file_size=30,
        )
        self.mapping = TrainingFileMapping.objects.create(
            module=self.module,
            submodule=self.submodule,
            cluster=self.cluster,
            training_file=self.tf_doc,
        )

        # Assign learner to course
        TrainingAssignment.objects.create(learner=self.learner, course=self.course, assigned_by=self.admin)

    def test_learner_can_list_materials(self):
        self.client.force_authenticate(user=self.learner)
        resp = self.client.get(f'/api/modules/{self.module.id}/materials/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['filename'], 'document1.pdf')

    def test_unassigned_learner_cannot_list_materials(self):
        self.client.force_authenticate(user=self.unassigned_learner)
        resp = self.client.get(f'/api/modules/{self.module.id}/materials/')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_learner_can_view_document_inline(self):
        self.client.force_authenticate(user=self.learner)
        resp = self.client.get(f'/api/modules/{self.module.id}/download-material/{self.tf_doc.id}/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('inline', resp.get('Content-Disposition', ''))

    def test_answer_key_protection(self):
        dummy_key = SimpleUploadedFile("18. Assessment - Recruitment Process_ Multiple Choice - PDF.pdf", b"%PDF-1.4 answer key", content_type="application/pdf")
        tf_key = TrainingFile.objects.create(
            id=12,
            file=dummy_key,
            filename='18. Assessment - Recruitment Process_ Multiple Choice - PDF.pdf',
            file_type='PDF',
            file_size=25,
        )
        TrainingFileMapping.objects.create(module=self.module, submodule=self.submodule, cluster=self.cluster, training_file=tf_key)

        # Learner listing must NOT include answer key
        self.client.force_authenticate(user=self.learner)
        resp = self.client.get(f'/api/modules/{self.module.id}/materials/')
        file_ids = [m['file_id'] for m in resp.data]
        self.assertNotIn(12, file_ids)

        # Direct download attempt by learner must return 403 Forbidden
        resp_dl = self.client.get(f'/api/modules/{self.module.id}/download-material/12/')
        self.assertEqual(resp_dl.status_code, status.HTTP_403_FORBIDDEN)
