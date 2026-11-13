from rest_framework import serializers

from ..models import (
    CalculatorSettings,
    ECDosingCalculation,
    FeasibilityAttachment,
    FeasibilityLineItem,
    FeasibilityReport,
    MarketingAsset,
    TimerCalculation,
)


class MarketingAssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = MarketingAsset
        fields = [
            "id",
            "title",
            "material_type",
            "category",
            "description",
            "file",
            "file_name",
            "file_size",
            "duration",
            "resolution",
            "format",
        ]
        read_only_fields = ["id", "file", "file_name", "file_size"]

class TimerCalculationSerializer(serializers.ModelSerializer):
    class Meta:
        model = TimerCalculation
        fields = ["id", "site", "input_data", "output_data", "created_at"]
        read_only_fields = ["id", "created_at"]



class CalculatorSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CalculatorSettings
        fields = ["constants", "ec_constants"]


class ECDosingCalculationSerializer(serializers.ModelSerializer):
    site_name = serializers.SerializerMethodField()

    class Meta:
        model = ECDosingCalculation
        fields = [
            "id",
            "unit_id",
            "site",
            "site_name",
            "title",
            "calculation_mode",
            "machine_model",
            "metal_type",
            "water_type",
            "input_params",
            "output_params",
            "notes",
            "created_by_user_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "unit_id", "created_at", "updated_at"]

    def get_site_name(self, obj: ECDosingCalculation) -> str:
        if obj.site_name:
            return obj.site_name
        if obj.site:
            return obj.site.site_name or (obj.site.customer.name if obj.site.customer else "")
        return ""


class FeasibilityAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = FeasibilityAttachment
        fields = [
            "id",
            "report",
            "category",
            "title",
            "file",
            "file_name",
            "file_size",
            "caption",
            "created_at",
        ]
        read_only_fields = ["id", "file", "file_name", "file_size", "created_at"]


class FeasibilityLineItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = FeasibilityLineItem
        fields = [
            "id",
            "item_name",
            "specification",
            "quantity",
            "unit",
            "unit_price",
            "total_price",
            "display_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "total_price", "created_at", "updated_at"]


class FeasibilityReportSerializer(serializers.ModelSerializer):
    attachments = FeasibilityAttachmentSerializer(many=True, read_only=True)
    items = FeasibilityLineItemSerializer(many=True, required=False)

    class Meta:
        model = FeasibilityReport
        fields = [
            "id",
            "proposal_number",
            "site",
            "unit_id",
            "site_name",
            "site_location",
            "project_title",
            "proposed_model",
            "model_name",
            "survey_date",
            "capacity_kld",
            "operating_hours",
            "water_type",
            "electrode_metal",
            "target_dose_mg_l",
            "supply_voltage",
            "conductivity_us_cm",
            "abstract",
            "observations",
            "design_parameters",
            "calculated_specs",
            "xpredict_scope",
            "client_scope",
            "terms_conditions",
            "water_specs",
            "status",
            "items",
            "attachments",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "calculated_specs", "created_at", "updated_at"]

