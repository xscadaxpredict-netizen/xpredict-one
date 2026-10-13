from rest_framework import serializers
from ..models import UserManual, MachineVideo, CallRequest

class UserManualSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserManual
        fields = ["id", "title", "category", "description", "file", "file_name", "file_size"]
        read_only_fields = ["id", "file", "file_name", "file_size"]

class MachineVideoSerializer(serializers.ModelSerializer):
    class Meta:
        model = MachineVideo
        fields = ["id", "title", "category", "description", "file", "file_name", "duration", "resolution"]
        read_only_fields = ["id", "file", "file_name"]

class CallRequestSerializer(serializers.ModelSerializer):
    date = serializers.DateTimeField(source="created_at", read_only=True)
    
    class Meta:
        model = CallRequest
        fields = ["id", "name", "phone", "email", "subject", "message", "status", "date", "attachment", "attachment_name"]
        read_only_fields = ["id", "date"]
