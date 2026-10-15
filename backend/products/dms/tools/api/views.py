from typing import ClassVar

from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from core.api import TenantAPIView

from ..models import CalculatorSettings
from ..selectors import get_marketing_assets, get_timer_calculations
from ..services import (
    create_marketing_asset,
    create_timer_calculation,
    delete_marketing_asset,
    delete_timer_calculation,
)
from .serializers import (
    CalculatorSettingsSerializer,
    MarketingAssetSerializer,
    TimerCalculationSerializer,
)


class MarketingAssetListView(TenantAPIView):
    # Organisation-wide material (`BaseModel`, no unit_id): any member may
    # read it, only the organisation-level role may add to it.
    required_permissions: ClassVar[list[str]] = []
    method_permissions: ClassVar[dict[str, list[str]]] = {
        "POST": ["dms.marketing_asset.manage"]
    }

    parser_classes: ClassVar[list] = [MultiPartParser, FormParser]

    def get(self, request, org_slug: str):
        assets = get_marketing_assets()
        serializer = MarketingAssetSerializer(assets, many=True)
        return Response(serializer.data)

    def post(self, request, org_slug: str):
        serializer = MarketingAssetSerializer(data=request.data)
        if serializer.is_valid():
            if "file" not in request.FILES:
                return Response({"detail": "File is required"}, status=status.HTTP_400_BAD_REQUEST)

            asset = create_marketing_asset(
                title=serializer.validated_data["title"],
                material_type=serializer.validated_data["material_type"],
                category=serializer.validated_data.get("category", ""),
                description=serializer.validated_data.get("description", ""),
                duration=serializer.validated_data.get("duration", ""),
                resolution=serializer.validated_data.get("resolution", ""),
                format=serializer.validated_data.get("format", ""),
                file=request.FILES["file"]
            )
            return Response(MarketingAssetSerializer(asset).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class MarketingAssetDetailView(TenantAPIView):
    required_permissions: ClassVar[list[str]] = ["dms.marketing_asset.manage"]

    def delete(self, request, org_slug: str, pk: str):
        delete_marketing_asset(pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TimerCalculationListView(TenantAPIView):
    # SAVING A CALCULATION IS USING THE TOOL, so POST needs nothing: the row
    # inherits `UnitScopedModel` and lands at the caller's own dealership.
    # Removing somebody's saved work is the Manager's call, below.
    required_permissions: ClassVar[list[str]] = []

    def get(self, request, org_slug: str):
        calcs = get_timer_calculations()
        serializer = TimerCalculationSerializer(calcs, many=True)
        return Response(serializer.data)

    def post(self, request, org_slug: str):
        serializer = TimerCalculationSerializer(data=request.data)
        if serializer.is_valid():
            calc = create_timer_calculation(
                site_id=request.data["site"],
                input_data=serializer.validated_data.get("input_data", {}),
                output_data=serializer.validated_data.get("output_data", {})
            )
            return Response(TimerCalculationSerializer(calc).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class TimerCalculationDetailView(TenantAPIView):
    required_permissions: ClassVar[list[str]] = ["dms.timer_calculation.delete"]

    def delete(self, request, org_slug: str, pk: str):
        delete_timer_calculation(pk)
        return Response(status=status.HTTP_204_NO_CONTENT)



class CalculatorSettingsView(TenantAPIView):
    # THE MOST DANGEROUS WRITE IN THIS MODULE, and it looked like the dullest.
    # These constants decide how every capacity calculation in the
    # organisation is sized, there is one row for the whole organisation
    # (`BaseModel`), and nothing records who changed them. Reading them is
    # open because the calculator screen needs them.
    required_permissions: ClassVar[list[str]] = []
    method_permissions: ClassVar[dict[str, list[str]]] = {"PUT": ["dms.calculator.manage"]}

    def get(self, request, org_slug: str):
        try:
            settings = CalculatorSettings.objects.first()
            if not settings:
                settings = CalculatorSettings.objects.create(
                    constants={
                        "home_avg_members": 4,
                        "home_lts_pp": 150,
                        "school_lts_pp": 45,
                        "commercial_lts_pp": 45,
                        "hosp_opd_lts": 25,
                        "hosp_ipd_lts": 400,
                        "hosp_extra_lts": 25,
                        "toilet_lts_pp": 15,
                        "stp_emp_lts": 45,
                        "stp_kitchen_lts": 15,
                        "resort_persons_pr": 3,
                        "resort_lts_pp": 80,
                        "resort_kitchen_lts": 45,
                        "resort_pool_lts": 45
                    }
                )
            serializer = CalculatorSettingsSerializer(settings)
            return Response(serializer.data)
        except Exception as e:
            import traceback
            with open("error_log_get.txt", "w") as f:
                traceback.print_exc(file=f)
            raise e

    def put(self, request, org_slug: str):
        try:
            settings = CalculatorSettings.objects.first()
            if not settings:
                settings = CalculatorSettings.objects.create(constants={})

            serializer = CalculatorSettingsSerializer(settings, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import traceback
            with open("error_log.txt", "w") as f:
                traceback.print_exc(file=f)
            raise e
