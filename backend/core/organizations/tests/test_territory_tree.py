"""
The territory tree itself (C72 piece 1, Q56): treebeard's materialised path on
`Territory`, and the three ways it could quietly go wrong here.

1. `0011` writes paths with its OWN encoding, so that the migration stays
   history. If it ever disagreed with treebeard's, every dealership migrated on
   a real database would sit at a path treebeard did not compute -- and the
   next box added beside them would collide or land in the wrong place.
2. A territory saved without going through treebeard has no path. The model
   refuses that rather than letting the first one through and the second one
   500.
3. Treebeard sorts by `path`. Anything that showed dealerships alphabetically
   was relying on `Meta.ordering`, which the manager now overrides.
"""

from __future__ import annotations

import importlib

import pytest

from core.organizations.models import Organization, Territory, TerritoryKind
from core.organizations.selectors import dealers_for

pytestmark = pytest.mark.django_db

PATHS = importlib.import_module("core.organizations.migrations.0011_territory_paths")


def make_org(slug: str = "apex") -> Organization:
    return Organization.objects.create(
        name=slug.title(), slug=slug, db_name=f"xpredict_tree_{slug}", db_host="127.0.0.1"
    )


class TestTheMigrationAgreesWithTreebeard:
    @pytest.mark.parametrize("position", [1, 2, 35, 36, 37, 1295, 1296, 60_466_175])
    def test_the_written_out_encoding_is_treebeards(self, position):
        """
        `0011` cannot import treebeard's encoder and stay history, so it
        carries its own. This is the check that the two agree, at the
        boundaries where base-36 carries: 35 -> 36, 1295 -> 1296, and the last
        position five characters can hold.
        """
        assert PATHS._encode(position) == Territory._get_path(None, 1, position)

    def test_decoding_undoes_encoding(self):
        """`0011` resumes after a partial run by decoding the last root's path."""
        for position in (1, 36, 1296, 60_466_175):
            assert PATHS._decode(PATHS._encode(position)) == position


class TestBuildingTheTree:
    def test_create_adds_a_top_level_territory(self):
        org = make_org()

        first = Territory.objects.create(organization=org, name="Delhi Motors")
        second = Territory.objects.create(organization=org, name="Jaipur Auto")

        assert (first.depth, second.depth) == (1, 1)
        assert first.path != second.path
        assert first.kind == TerritoryKind.DEALER
        assert Territory.objects.find_problems() == ([], [], [], [], [])

    def test_a_region_holds_dealers_and_a_dealer_holds_branches(self):
        org = make_org()
        north = Territory.objects.create(organization=org, name="North", kind=TerritoryKind.REGION)
        delhi = Territory.objects.add_child(
            north, {"organization": org, "name": "Delhi Motors", "kind": TerritoryKind.DEALER}
        )
        Territory.objects.add_child(
            delhi, {"organization": org, "name": "Karol Bagh", "kind": TerritoryKind.BRANCH}
        )

        under_north = Territory.objects.get_descendants(Territory.objects.get(pk=north.pk))

        assert [t.name for t in under_north] == ["Delhi Motors", "Karol Bagh"]
        assert Territory.objects.find_problems() == ([], [], [], [], [])

    def test_moving_a_dealership_under_a_region_takes_its_branches_along(self):
        """
        Every existing dealership arrives as a root (`0011`), so this is the
        first thing an organisation will do: create a region and move its
        dealerships under it.
        """
        org = make_org()
        delhi = Territory.objects.create(organization=org, name="Delhi Motors")
        Territory.objects.add_child(
            delhi, {"organization": org, "name": "Karol Bagh", "kind": TerritoryKind.BRANCH}
        )
        north = Territory.objects.create(organization=org, name="North", kind=TerritoryKind.REGION)

        Territory.objects.move(delhi, north, "last-child")

        branch = Territory.objects.get(name="Karol Bagh")
        assert branch.depth == 3
        assert branch.path.startswith(Territory.objects.get(pk=north.pk).path)
        assert Territory.objects.find_problems() == ([], [], [], [], [])

    def test_two_organisations_share_one_sequence_of_roots_without_colliding(self):
        apex, bharat = make_org("apex"), make_org("bharat")

        a = Territory.objects.create(organization=apex, name="Delhi Motors")
        b = Territory.objects.create(organization=bharat, name="Delhi Motors")

        assert a.path != b.path
        assert Territory.objects.filter(organization=apex).count() == 1


class TestATerritoryWithoutAPlaceIsRefused:
    def test_a_queryset_create_cannot_save_a_box_with_no_path(self):
        """
        `QuerySet.create()` -- which `get_or_create()` uses -- skips the
        manager's `create()`. Without the guard the first such territory saves
        with an empty path and the second is an IntegrityError: a 500, after
        the tree has already been corrupted once.
        """
        org = make_org()

        with pytest.raises(ValueError, match="place in the tree"):
            Territory.objects.all().create(organization=org, name="Nowhere")

        assert not Territory.objects.filter(name="Nowhere").exists()


class TestDealershipsAreStillListedByName:
    def test_dealers_come_back_alphabetically_not_in_tree_order(self):
        """
        Created Z to A, so tree order (creation order) and name order are
        exact opposites. `Meta.ordering` used to give name order for free; the
        treebeard manager sorts by `path` and overrides it.
        """
        org = make_org()
        for name in ("Zirakpur", "Mohali", "Amritsar"):
            Territory.objects.create(organization=org, name=name)

        assert [d.name for d in dealers_for(org)] == ["Amritsar", "Mohali", "Zirakpur"]
