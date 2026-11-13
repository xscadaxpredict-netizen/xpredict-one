"""
The territory tree itself (C72 piece 1, Q56): treebeard's materialised path on
`Territory`, with the organisation at the root, and the ways it could quietly go
wrong here.

1. `0011` and `0014` write paths with their OWN encoding, so that the
   migrations stay history. If it ever disagreed with treebeard's, every
   territory migrated on a real database would sit at a path treebeard did not
   compute -- and the next box added beside it would collide.
2. A territory saved without going through treebeard has no path. The model
   refuses that rather than letting the first one through and the second 500.
3. EXACTLY ONE ROOT PER ORGANISATION, AND IT IS THE ORGANISATION (the owner,
   2026-11-06). The database refuses a second root, a root of another kind and
   a non-organisation box at the top; the manager makes the root on first use.
4. Treebeard sorts by `path`. Anything that showed dealerships alphabetically
   was relying on `Meta.ordering`, which the manager now overrides.
"""

from __future__ import annotations

import importlib
from unittest.mock import patch

import pytest
from django.db import IntegrityError

from core.organizations.models import Organization, Territory, TerritoryKind
from core.organizations.selectors import dealers_for

pytestmark = pytest.mark.django_db

PATHS_0011 = importlib.import_module("core.organizations.migrations.0011_territory_paths")
PATHS_0014 = importlib.import_module(
    "core.organizations.migrations.0014_territory_organisation_roots"
)
NO_PROBLEMS = ([], [], [], [], [])


def make_org(slug: str = "apex") -> Organization:
    return Organization.objects.create(
        name=slug.title(), slug=slug, db_name=f"xpredict_tree_{slug}", db_host="127.0.0.1"
    )


def fresh(territory: Territory) -> Territory:
    return Territory.objects.get(pk=territory.pk)


class TestTheMigrationsAgreeWithTreebeard:
    @pytest.mark.parametrize("migration", [PATHS_0011, PATHS_0014], ids=["0011", "0014"])
    @pytest.mark.parametrize("position", [1, 2, 35, 36, 37, 1295, 1296, 60_466_175])
    def test_the_written_out_encoding_is_treebeards(self, migration, position):
        """
        A migration cannot import treebeard's encoder and stay history, so each
        carries its own. This checks they agree with treebeard at the
        boundaries where base 36 carries: 35 -> 36, 1295 -> 1296, and the last
        position five characters can hold.
        """
        assert migration._encode(position) == Territory._get_path(None, 1, position)

    @pytest.mark.parametrize("migration", [PATHS_0011, PATHS_0014], ids=["0011", "0014"])
    def test_decoding_undoes_encoding(self, migration):
        """Both resume after a partial run by decoding the paths already written."""
        for position in (1, 36, 1296, 60_466_175):
            assert migration._decode(migration._encode(position)) == position


class TestTheOrganisationIsTheRoot:
    def test_root_for_makes_one_root_of_kind_organisation_and_reuses_it(self):
        org = make_org()

        root = Territory.objects.root_for(org)

        assert (root.kind, root.depth, root.is_root) == (TerritoryKind.ORGANISATION, 1, True)
        assert Territory.objects.root_for(org).pk == root.pk
        assert Territory.objects.filter(organization=org).count() == 1

    def test_the_root_shows_the_organisations_name_and_stores_none(self):
        """One copy of the name, so renaming the organisation cannot leave the tree behind."""
        org = make_org()
        root = Territory.objects.root_for(org)

        org.name = "Apex Motors Ltd"
        org.save()

        assert fresh(root).name == ""
        assert fresh(root).display_name == "Apex Motors Ltd"

    def test_the_database_refuses_a_second_root(self):
        """
        THE SECOND ROOT HAS A NAME, AND THE ASSERTION NAMES THE RULE. The first
        version gave it `name=""` like the real root -- and the unique-name rule
        refused it, so the test passed with the one-root rule deleted. A revert
        check caught that. Now only `territory_one_root_per_org` can refuse it.
        """
        org = make_org()
        Territory.objects.root_for(org)

        with pytest.raises(IntegrityError) as caught:
            Territory.objects.add_root(
                {
                    "organization": org,
                    "kind": TerritoryKind.ORGANISATION,
                    "name": "A second top",
                    "is_root": True,
                }
            )

        assert "territory_one_root_per_org" in str(caught.value)

    def test_the_database_refuses_anything_else_at_the_top(self):
        """
        A region left beside the root instead of under it would be a second
        top for one organisation's tree. The check constraint, not only the
        services, refuses it.
        """
        org = make_org()
        Territory.objects.root_for(org)

        with pytest.raises(IntegrityError) as caught:
            Territory.objects.add_root(
                {"organization": org, "kind": TerritoryKind.REGION, "name": "North"}
            )

        assert "territory_root_is_the_organisation" in str(caught.value)

    def test_two_organisations_each_get_their_own_tree(self):
        apex, bharat = make_org("apex"), make_org("bharat")

        a = Territory.objects.create(organization=apex, name="Delhi Motors")
        b = Territory.objects.create(organization=bharat, name="Delhi Motors")

        assert a.path[:5] == Territory.objects.root_for(apex).path
        assert b.path[:5] == Territory.objects.root_for(bharat).path
        assert a.path[:5] != b.path[:5]


class TestBuildingTheTree:
    def test_create_adds_a_territory_directly_under_the_organisation(self):
        org = make_org()

        first = Territory.objects.create(organization=org, name="Delhi Motors")
        second = Territory.objects.create(organization=org, name="Jaipur Auto")

        root = Territory.objects.root_for(org)
        assert (first.depth, second.depth) == (2, 2)
        assert first.path.startswith(root.path) and second.path.startswith(root.path)
        assert first.path != second.path
        assert first.kind == TerritoryKind.DEALER
        assert fresh(root).numchild == 2
        assert Territory.objects.find_problems() == NO_PROBLEMS

    def test_a_region_holds_dealers_and_a_dealer_holds_branches(self):
        org = make_org()
        north = Territory.objects.create(organization=org, name="North", kind=TerritoryKind.REGION)
        delhi = Territory.objects.add_child(
            north, {"organization": org, "name": "Delhi Motors", "kind": TerritoryKind.DEALER}
        )
        Territory.objects.add_child(
            delhi, {"organization": org, "name": "Karol Bagh", "kind": TerritoryKind.BRANCH}
        )

        under_north = Territory.objects.get_descendants(fresh(north))

        assert [t.name for t in under_north] == ["Delhi Motors", "Karol Bagh"]
        assert Territory.objects.find_problems() == NO_PROBLEMS

    def test_moving_a_dealership_under_a_region_takes_its_branches_along(self):
        """
        Every existing dealership sits directly under the organisation
        (`0014`), so this is the first thing an organisation will do: create a
        region and move its dealerships under it.
        """
        org = make_org()
        delhi = Territory.objects.create(organization=org, name="Delhi Motors")
        Territory.objects.add_child(
            delhi, {"organization": org, "name": "Karol Bagh", "kind": TerritoryKind.BRANCH}
        )
        north = Territory.objects.create(organization=org, name="North", kind=TerritoryKind.REGION)

        Territory.objects.move(fresh(delhi), fresh(north), "last-child")

        branch = Territory.objects.get(name="Karol Bagh")
        assert branch.depth == 4
        assert branch.path.startswith(fresh(north).path)
        assert Territory.objects.find_problems() == NO_PROBLEMS


class TestTwoOrganisationsSigningUpAtOnce:
    """
    Every organisation's root is a treebeard root, and roots share one
    sequence, so two roots made in the same instant can compute the same path.
    Roots are made only once per organisation now -- at sign-up -- and that one
    collision is retried.
    """

    def test_mysql_names_the_path_index_in_the_error_the_retry_looks_for(self):
        """
        The retry recognises the collision by the path index's name in MySQL's
        message. This pins that against the real server -- AND IT HAS ALREADY
        EARNED ITS PLACE: the first version looked for `.path'`, which MySQL
        never prints (it names the index, not the column), so the retry could
        never fire while the mocked test below passed happily.
        """
        a = Territory.objects.root_for(make_org("apex"))
        b = Territory.objects.root_for(make_org("bharat"))

        with pytest.raises(IntegrityError) as caught:
            Territory.objects.filter(pk=b.pk).update(path=a.path)

        assert f"{Territory._meta.db_table}_path_" in str(caught.value)

    def test_a_collision_on_the_root_path_is_retried(self):
        real_add_root = Territory.objects.add_root
        calls = []

        def collide_once(create_kwargs=None, **kwargs):
            calls.append(1)
            if len(calls) == 1:
                # MySQL's real wording, as the test above pins it.
                raise IntegrityError(
                    "(1062, \"Duplicate entry '00001' for key "
                    "'organizations_territory.organizations_territory_path_be21f7d1_uniq'\")"
                )
            return real_add_root(create_kwargs, **kwargs)

        with patch.object(Territory.objects, "add_root", side_effect=collide_once):
            root = Territory.objects.root_for(make_org())

        assert len(calls) == 2
        assert fresh(root).is_root is True

    def test_any_other_integrity_error_is_not_retried(self):
        calls = []

        def other_clash(create_kwargs=None, **kwargs):
            calls.append(1)
            raise IntegrityError(
                "(1062, \"Duplicate entry 'x' for key "
                "'organizations_territory.territory_one_root_per_org'\")"
            )

        with patch.object(Territory.objects, "add_root", side_effect=other_clash):
            with pytest.raises(IntegrityError):
                Territory.objects.root_for(make_org())

        assert len(calls) == 1


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
