from typing import ClassVar

from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from core.api import TenantAPIView

from ..feasibility_engine import calculate_reclaimer_feasibility
from ..models import CalculatorSettings
from ..selectors import (
    get_active_feasibility_template,
    get_ec_calculation,
    get_ec_calculations,
    get_feasibility_attachments,
    get_feasibility_report,
    get_feasibility_reports,
    get_marketing_assets,
    get_timer_calculations,
)
from ..services import (
    create_ec_calculation,
    create_feasibility_attachment,
    create_feasibility_report,
    create_marketing_asset,
    create_timer_calculation,
    delete_ec_calculation,
    delete_feasibility_attachment,
    delete_feasibility_report,
    delete_marketing_asset,
    delete_timer_calculation,
    update_feasibility_report,
)
from .serializers import (
    CalculatorSettingsSerializer,
    ECDosingCalculationSerializer,
    FeasibilityAttachmentSerializer,
    FeasibilityReportSerializer,
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



DEFAULT_CAPACITY_CONSTANTS = {
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
    "resort_pool_lts": 45,
}

DEFAULT_EC_CONSTANTS = {
    "machines": {
        "6kld": {
            "key": "6kld",
            "name": "HIDREC 6 KLD",
            "capacity_kld": 6.0,
            "length_mm": 1000,
            "width_mm": 500,
            "depth_mm": 800,
            "volume_m3": 0.400,
            "plate_count": 4,
            "plate_length_mm": 500,
            "plate_height_mm": 300,
            "plate_thickness_mm": 6,
            "plate_spacing_mm": 20,
            "supply_voltage_max": 40.0,
            "default_current_amps": 15.0,
        },
        "25kld": {
            "key": "25kld",
            "name": "HIDREC 25 KLD",
            "capacity_kld": 25.0,
            "length_mm": 1600,
            "width_mm": 800,
            "depth_mm": 1000,
            "volume_m3": 1.280,
            "plate_count": 6,
            "plate_length_mm": 800,
            "plate_height_mm": 400,
            "plate_thickness_mm": 6,
            "plate_spacing_mm": 25,
            "supply_voltage_max": 48.0,
            "default_current_amps": 40.0,
        },
        "50kld": {
            "key": "50kld",
            "name": "HIDREC 50 KLD",
            "capacity_kld": 50.0,
            "length_mm": 2000,
            "width_mm": 1000,
            "depth_mm": 1200,
            "volume_m3": 2.400,
            "plate_count": 8,
            "plate_length_mm": 1000,
            "plate_height_mm": 400,
            "plate_thickness_mm": 8,
            "plate_spacing_mm": 30,
            "supply_voltage_max": 48.0,
            "default_current_amps": 80.0,
        },
    },
    "metals": {
        "AL": {"key": "AL", "name": "Aluminium (Al)", "molar_mass": 27.0, "valence_n": 3},
        "MS": {"key": "MS", "name": "Mild Steel / Iron (Fe)", "molar_mass": 56.0, "valence_n": 2},
    },
    "water_types": [
        {
            "id": "algal",
            "name": "Micro algal green water",
            "default_dose": 35.0,
            "settling_time_min": 6,
        },
        {
            "id": "laundry",
            "name": "Laundry Waste Water",
            "default_dose": 25.0,
            "settling_time_min": 5,
        },
        {"id": "grey", "name": "Domestic Grey water", "default_dose": 20.0, "settling_time_min": 5},
        {
            "id": "mixed_sewage",
            "name": "Mixed Sewage water",
            "default_dose": 30.0,
            "settling_time_min": 6,
        },
        {
            "id": "black",
            "name": "Domestic Black Water",
            "default_dose": 40.0,
            "settling_time_min": 7,
        },
        {
            "id": "industrial_sewage",
            "name": "Mixed Industrial Sewage",
            "default_dose": 35.0,
            "settling_time_min": 7,
        },
        {
            "id": "hospital",
            "name": "Hospital Waste water",
            "default_dose": 35.0,
            "settling_time_min": 6,
        },
        {"id": "lake", "name": "Lake water", "default_dose": 15.0, "settling_time_min": 5},
        {
            "id": "textile",
            "name": "Textile Dyeing water",
            "default_dose": 45.0,
            "settling_time_min": 7,
        },
        {
            "id": "starch",
            "name": "Starch rich waste water",
            "default_dose": 40.0,
            "settling_time_min": 7,
        },
        {
            "id": "effluent",
            "name": "Mixed Industrial Effluent water",
            "default_dose": 45.0,
            "settling_time_min": 7,
        },
    ],
    "custom_parameters": {
        "faraday_constant": 96485,
    },
}


class CalculatorSettingsView(TenantAPIView):
    # THE MOST DANGEROUS WRITE IN THIS MODULE. These constants decide how every
    # capacity and EC dosing calculation in the organisation is sized, and there
    # is one row for the whole organisation (`BaseModel`) --- so per C67 only an
    # organisation-level code may write it, never a dealership's Manager.
    # Reading is open because the calculator screens need the constants.
    required_permissions: ClassVar[list[str]] = []
    method_permissions: ClassVar[dict[str, list[str]]] = {"PUT": ["dms.calculator.manage"]}

    def get(self, request, org_slug: str):
        try:
            settings = CalculatorSettings.objects.first()
            if not settings:
                settings = CalculatorSettings.objects.create(
                    constants=DEFAULT_CAPACITY_CONSTANTS,
                    ec_constants=DEFAULT_EC_CONSTANTS,
                )
            else:
                needs_save = False
                if not settings.constants or not any(settings.constants.values()):
                    settings.constants = DEFAULT_CAPACITY_CONSTANTS
                    needs_save = True
                if not settings.ec_constants:
                    settings.ec_constants = DEFAULT_EC_CONSTANTS
                    needs_save = True
                if needs_save:
                    settings.save()

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
                settings = CalculatorSettings.objects.create(
                    constants=DEFAULT_CAPACITY_CONSTANTS,
                    ec_constants=DEFAULT_EC_CONSTANTS,
                )

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


class ECDosingCalculationListView(TenantAPIView):
    required_permissions: ClassVar[list[str]] = []

    def get(self, request, org_slug: str):
        unit_id = request.unit_id
        calculations = get_ec_calculations(unit_id)
        serializer = ECDosingCalculationSerializer(calculations, many=True)
        return Response(serializer.data)

    def post(self, request, org_slug: str):
        data = request.data
        calculation = create_ec_calculation(
            unit_id=request.unit_id,
            site_id=data.get("site"),
            site_name=data.get("site_name", ""),
            title=data.get("title", "EC Dosing Calculation"),
            calculation_mode=data.get("calculation_mode", "TIME_FROM_DOSE"),
            machine_model=data.get("machine_model", "CUSTOM"),
            metal_type=data.get("metal_type", "AL"),
            water_type=data.get("water_type", ""),
            input_params=data.get("input_params", {}),
            output_params=data.get("output_params", {}),
            notes=data.get("notes", ""),
            created_by_user_id=getattr(request.user, "id", None),
        )
        serializer = ECDosingCalculationSerializer(calculation)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ECDosingCalculationDetailView(TenantAPIView):
    required_permissions: ClassVar[list[str]] = []

    def get(self, request, org_slug: str, pk: str):
        calc = get_ec_calculation(pk)
        if not calc:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = ECDosingCalculationSerializer(calc)
        return Response(serializer.data)

    def delete(self, request, org_slug: str, pk: str):
        delete_ec_calculation(pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ============================================================================
# Feasibility Views
# ============================================================================


class FeasibilityCalculateLiveView(TenantAPIView):
    """
    Live parameter calculator endpoint.
    Takes capacity, operating hours, electrode metal, dose, etc., and returns
    full engineering specifications instantaneously without saving to database.
    """

    required_permissions: ClassVar[list[str]] = []

    def post(self, request, org_slug: str):
        data = request.data
        try:
            capacity_kld = float(data.get("capacity_kld", 15.0))
            operating_hours = float(data.get("operating_hours", 18.0))
            electrode_metal = str(data.get("electrode_metal", "AL")).upper()
            target_dose_mg_l = float(data.get("target_dose_mg_l", 25.0))
            supply_voltage = float(data.get("supply_voltage", 48.0))
            raw_bod = float(data.get("raw_bod", 220.0))
            treated_bod = float(data.get("treated_bod", 10.0))
            raw_cod = float(data.get("raw_cod", 350.0))
            treated_cod = float(data.get("treated_cod", 50.0))
            raw_tss = float(data.get("raw_tss", 300.0))
            treated_tss = float(data.get("treated_tss", 20.0))
            raw_tds = float(data.get("raw_tds", 1100.0))
            treated_tds = float(data.get("treated_tds", 1100.0))
            conductivity_us_cm = float(data.get("conductivity_us_cm", 2000.0))

            specs = calculate_reclaimer_feasibility(
                capacity_kld=capacity_kld,
                operating_hours=operating_hours,
                electrode_metal=electrode_metal,
                target_dose_mg_l=target_dose_mg_l,
                supply_voltage=supply_voltage,
                raw_bod=raw_bod,
                treated_bod=treated_bod,
                raw_cod=raw_cod,
                treated_cod=treated_cod,
                raw_tss=raw_tss,
                treated_tss=treated_tss,
                raw_tds=raw_tds,
                treated_tds=treated_tds,
                conductivity_us_cm=conductivity_us_cm,
            )
            return Response(specs, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class FeasibilityTemplateView(TenantAPIView):
    """
    Default Feasibility Proposal Content endpoint.
    Returns standard proposal boilerplate without requiring a separate database table.
    """

    required_permissions: ClassVar[list[str]] = []

    def get(self, request, org_slug: str):
        water_type = request.query_params.get("water_type")
        template_data = get_active_feasibility_template(water_type=water_type)
        return Response(template_data)

    def put(self, request, org_slug: str):
        return Response(request.data)


class FeasibilityReportListView(TenantAPIView):
    required_permissions: ClassVar[list[str]] = []

    def get(self, request, org_slug: str):
        reports = get_feasibility_reports()
        serializer = FeasibilityReportSerializer(reports, many=True)
        return Response(serializer.data)

    def post(self, request, org_slug: str):
        data = request.data
        try:
            report = create_feasibility_report(
                site_id=data.get("site"),
                unit_id=data.get("unit_id"),
                proposal_number=data.get("proposal_number", ""),
                site_name=data.get("site_name", "Prospective Site"),
                site_location=data.get("site_location", ""),
                project_title=data.get("project_title", "Waste Water Reclaimer Plant"),
                proposed_model=data.get("proposed_model", "HIDREC EZ 1000"),
                survey_date=data.get("survey_date"),
                capacity_kld=float(data.get("capacity_kld", 15.0)),
                operating_hours=float(data.get("operating_hours", 18.0)),
                water_type=data.get("water_type", "Mixed Domestic Sewage"),
                electrode_metal=data.get("electrode_metal", "AL"),
                target_dose_mg_l=float(data.get("target_dose_mg_l", 25.0)),
                supply_voltage=float(data.get("supply_voltage", 48.0)),
                conductivity_us_cm=float(data.get("conductivity_us_cm", 2000.0)),
                abstract=data.get("abstract", ""),
                observations=data.get("observations", []),
                design_parameters=data.get("design_parameters", {}),
                xpredict_scope=data.get("xpredict_scope"),
                client_scope=data.get("client_scope"),
                terms_conditions=data.get("terms_conditions"),
                water_specs=data.get("water_specs"),
                items=data.get("items"),
                status=data.get("status", "DRAFT"),
            )
            return Response(
                FeasibilityReportSerializer(report).data, status=status.HTTP_201_CREATED
            )
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class FeasibilityReportDetailView(TenantAPIView):
    required_permissions: ClassVar[list[str]] = []

    def get(self, request, org_slug: str, pk: str):
        report = get_feasibility_report(pk)
        if not report:
            return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(FeasibilityReportSerializer(report).data)

    def put(self, request, org_slug: str, pk: str):
        try:
            report = update_feasibility_report(pk, **request.data)
            return Response(FeasibilityReportSerializer(report).data)
        except ValueError:
            return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, org_slug: str, pk: str):
        delete_feasibility_report(pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


class FeasibilityAttachmentView(TenantAPIView):
    required_permissions: ClassVar[list[str]] = []
    parser_classes: ClassVar[list] = [MultiPartParser, FormParser]

    def get(self, request, org_slug: str, pk: str):
        attachments = get_feasibility_attachments(pk)
        return Response(FeasibilityAttachmentSerializer(attachments, many=True).data)

    def post(self, request, org_slug: str, pk: str):
        if "file" not in request.FILES:
            return Response({"detail": "No file uploaded"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            attachment = create_feasibility_attachment(
                report_id=pk,
                category=request.data.get("category", "OTHER"),
                title=request.data.get("title", request.FILES["file"].name),
                file=request.FILES["file"],
                caption=request.data.get("caption", ""),
            )
            return Response(
                FeasibilityAttachmentSerializer(attachment).data, status=status.HTTP_201_CREATED
            )
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class FeasibilityAttachmentDetailView(TenantAPIView):
    required_permissions: ClassVar[list[str]] = []

    def delete(self, request, org_slug: str, pk: str, attachment_id: str):
        delete_feasibility_attachment(attachment_id)
        return Response(status=status.HTTP_204_NO_CONTENT)
