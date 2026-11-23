import pytest

from products.dms.tools.feasibility_engine import calculate_reclaimer_feasibility


def test_feasibility_engine_15kld_al():
    specs = calculate_reclaimer_feasibility(
        capacity_kld=15.0,
        operating_hours=18.0,
        electrode_metal="AL",
        target_dose_mg_l=25.0,
        supply_voltage=48.0,
    )
    assert "hydraulics" in specs
    assert specs["hydraulics"]["capacity_kld"] == 15.0
    assert specs["hydraulics"]["flow_m3_hr"] == 0.83

    # Check EC chamber
    assert "ec_chamber" in specs
    assert specs["ec_chamber"]["electrode_metal"] == "Aluminium (Al)"
    assert specs["ec_chamber"]["plate_count"] >= 4
    assert specs["ec_chamber"]["total_reactor_volume_l"] > 100
    assert specs["ec_chamber"]["operating_current_amps"] > 0
    assert specs["ec_chamber"]["replacement_lifespan_months"] > 0

    # Check filtration
    assert "media_filter" in specs
    assert specs["media_filter"]["vessel_dia_mm"] >= 300

    # Check civil footprint
    assert specs["footprint"]["total_area_sqft"] == 200.0


def test_feasibility_engine_iron():
    specs = calculate_reclaimer_feasibility(
        capacity_kld=25.0,
        operating_hours=20.0,
        electrode_metal="FE",
        target_dose_mg_l=35.0,
    )
    assert specs["ec_chamber"]["electrode_metal"] == "Mild Steel (Fe)"
    assert specs["ec_chamber"]["plate_count"] >= 4
    assert specs["footprint"]["total_area_sqft"] > 0


@pytest.mark.django_db(databases=["default", "xpredict_test_tenant"])
def test_feasibility_proposal_and_line_items():
    from config.routers import current_tenant_db
    from conftest import TEST_TENANT_ALIAS
    from products.dms.tools.models import FeasibilityReport
    from products.dms.tools.services import create_feasibility_report, update_feasibility_report

    token = current_tenant_db.set(TEST_TENANT_ALIAS)
    try:
        report = create_feasibility_report(
            site_name="Test Enterprise Site",
            proposed_model="HIDREC EZ 1000",
            capacity_kld=15.0,
            operating_hours=18.0,
        )
        assert report.id is not None
        assert report.proposed_model == "HIDREC EZ 1000"
        assert FeasibilityReport.objects.count() == 1

        # Check default line items were automatically seeded
        items = list(report.items.all().order_by("display_order"))
        assert len(items) == 3
        assert items[0].quantity == 1
        assert items[0].total_price == items[0].quantity * items[0].unit_price

        # Check updating report and line items
        updated = update_feasibility_report(
            str(report.id),
            proposed_model="HIDREC EZ 2000",
            capacity_kld=25.0,
            items=[
                {
                    "item_name": "Custom Reactor Chamber",
                    "quantity": 2,
                    "unit_price": 300000.0,
                    "unit": "Set",
                }
            ],
        )
        assert updated.proposed_model == "HIDREC EZ 2000"
        assert updated.capacity_kld == 25.0
        assert updated.items.count() == 1
        custom_item = updated.items.first()
        assert custom_item.item_name == "Custom Reactor Chamber"
        assert custom_item.total_price == 600000.0
    finally:
        current_tenant_db.reset(token)
