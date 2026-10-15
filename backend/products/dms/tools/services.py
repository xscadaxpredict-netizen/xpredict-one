from __future__ import annotations

from django.core.files.uploadedfile import UploadedFile

from .models import MarketingAsset, TimerCalculation


def create_marketing_asset(
    *, title: str, material_type: str, category: str = "", description: str = "",
    file: UploadedFile, duration: str = "", resolution: str = "", format: str = ""
) -> MarketingAsset:
    asset = MarketingAsset(
        title=title,
        material_type=material_type,
        category=category,
        description=description,
        file=file,
        file_name=file.name,
        file_size=f"{file.size / (1024 * 1024):.2f} MB",
        duration=duration,
        resolution=resolution,
        format=format
    )
    asset.save()
    return asset

def delete_marketing_asset(asset_id: str) -> None:
    MarketingAsset.objects.filter(id=asset_id).delete()

def create_timer_calculation(
    *,
    site_id: str,
    input_data: dict,
    output_data: dict,
) -> TimerCalculation:
    calc = TimerCalculation(
        site_id=site_id,
        input_data=input_data,
        output_data=output_data
    )
    calc.save()
    return calc

def delete_timer_calculation(calc_id: str) -> None:
    TimerCalculation.objects.filter(id=calc_id).delete()
