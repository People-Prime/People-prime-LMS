
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "ADMIN", "Admin"
        TRAINER = "TRAINER", "Trainer"
        LEARNER = "LEARNER", "Learner"

    role = models.CharField(
        max_length=10,
        choices=Role.choices,
        default=Role.LEARNER,
    )

    def __str__(self):
        return self.username
