from rest_framework import serializers
from ..models import MarketingAsset, TimerCalculation
from ..models import CalculatorSettings


class MarketingAssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = MarketingAsset
        fields = ["id", "title", "material_type", "category", "description", "file", "file_name", "file_size", "duration", "resolution", "format"]
        read_only_fields = ["id", "file", "file_name", "file_size"]

class TimerCalculationSerializer(serializers.ModelSerializer):
    class Meta:
        model = TimerCalculation
        fields = ["id", "site", "input_data", "output_data", "created_at"]
        read_only_fields = ["id", "created_at"]



class CalculatorSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CalculatorSettings
        fields = ["constants"]
