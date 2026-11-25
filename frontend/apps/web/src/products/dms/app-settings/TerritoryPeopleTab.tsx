/**
 * A territory's PEOPLE tab (the owner, 2026-11-24): who works AT this
 * territory -- not under it -- with their DMS role, and where else they work.
 *
 *   + Assign users -- adds this territory to where the chosen people work
 *   each row's ⋮   -- Move to another territory, Remove from this one
 *
 * All three change somebody's DMS, so they are `dms.user.update`, the same as
 * DMS Users -> Edit's Territory field; greyed without it.
 */

import { useState } from "react";
import { asProblem } from "@xpredict/api-client";
import { ErrorState } from "@xpredict/ui";
import { SearchIcon } from "lucide-react";

import { useAccess } from "../../../shell/access";
import { RowMenu } from "@xpredict/ui";
import { AssignPeopleDialog } from "./AssignPeopleDialog";
import { MovePersonDialog, personName, RemovePersonDialog } from "./PersonPlaceDialogs";
import type { TerritoryPerson } from "./territories";
import type { Tree, TreeNode } from "./territoryTree";
import { useTerritoryPeople } from "./useTerritories";
import styles from "./TerritoryPeople.module.css";

interface TerritoryPeopleTabProps {
  node: TreeNode;
  tree: Tree;
}

export function TerritoryPeopleTab({ node, tree }: TerritoryPeopleTabProps) {
  const { territory } = node;
  const { data: people, isPending, isError, error, refetch } = useTerritoryPeople(territory.id);
  const canPlace = useAccess().can("dms.user.update");
  const [assigning, setAssigning] = useState(false);
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const shown = people?.filter(
    (person) =>
      !needle ||
      personName(person).toLowerCase().includes(needle) ||
      person.email.toLowerCase().includes(needle),
  );
  const below = node.people - territory.people_count;

  return (
    <div className={styles.tab}>
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <SearchIcon size={16} aria-hidden="true" />
          <span className={styles.visuallyHidden}>Search people here</span>
          <input
            type="search"
            placeholder="Search people here"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button
          type="button"
          className={styles.assign}
          aria-disabled={canPlace ? undefined : "true"}
          title={canPlace ? undefined : "Your role lets you see people, not place them"}
          onClick={() => canPlace && setAssigning(true)}
        >
          + Assign users
        </button>
      </div>

      <p className={styles.caption}>
        {territory.is_root
          ? "Placed at the organisation: they see every DMS record."
          : `Placed at ${territory.name}. They see its records${
              node.below > 0 ? " and everything under it" : ""
            }.`}
      </p>

      {isPending && <p className={styles.caption}>Loading people…</p>}
      {isError && (
        <ErrorState
          title="Could not load the people here"
          code={asProblem(error).code}
          traceId={asProblem(error).trace_id}
          onRetry={() => void refetch()}
        />
      )}

      {shown && people && (
        <>
          {people.length === 0 ? (
            <p className={styles.empty}>Nobody works at {territory.name} yet.</p>
          ) : shown.length === 0 ? (
            <p className={styles.empty}>Nobody here matches “{query.trim()}”.</p>
          ) : (
            <ul className={styles.list} aria-label={`People at ${territory.name}`}>
              {shown.map((person) => (
                <PersonRow
                  key={person.id}
                  node={node}
                  tree={tree}
                  person={person}
                  canPlace={canPlace}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {below > 0 && (
        <p className={styles.caption}>
          {below === 1 ? "1 more person works" : `${String(below)} more people work`} in the
          territories under it.
        </p>
      )}

      {people && (
        <AssignPeopleDialog
          territory={territory}
          here={people}
          open={assigning}
          onOpenChange={setAssigning}
        />
      )}
    </div>
  );
}

interface PersonRowProps {
  node: TreeNode;
  tree: Tree;
  person: TerritoryPerson;
  canPlace: boolean;
}

function PersonRow({ node, tree, person, canPlace }: PersonRowProps) {
  const [opened, setOpened] = useState<"move" | "remove" | null>(null);
  const { territory } = node;
  const name = personName(person);

  return (
    <li className={styles.row}>
      <span className={styles.badge} aria-hidden="true">
        {initialsOf(person)}
      </span>
      <span className={styles.text}>
        <span className={styles.name}>{name}</span>
        <span className={styles.sub}>
          {person.email}
          {person.other_places.length > 0 && ` · also at ${person.other_places.join(", ")}`}
        </span>
      </span>
      {person.access_status === "disabled" && <span className={styles.off}>DMS off</span>}
      <span className={styles.role}>{person.role?.name ?? "—"}</span>
      <RowMenu
        label={`More actions for ${name}`}
        items={[
          { label: "Move to another territory", disabled: !canPlace, onSelect: () => setOpened("move") },
          {
            label: "Remove from territory",
            danger: true,
            disabled: !canPlace,
            onSelect: () => setOpened("remove"),
          },
        ]}
        note={canPlace ? undefined : "Your role lets you see people, not place them."}
      />

      {opened === "move" && (
        <MovePersonDialog
          territory={territory}
          person={person}
          tree={tree}
          open
          onOpenChange={(open) => !open && setOpened(null)}
        />
      )}
      {opened === "remove" && (
        <RemovePersonDialog
          territory={territory}
          person={person}
          open
          onOpenChange={(open) => !open && setOpened(null)}
        />
      )}
    </li>
  );
}

function initialsOf(person: TerritoryPerson): string {
  const letters = [person.first_name, person.last_name]
    .map((part) => part.trim().charAt(0))
    .filter(Boolean);
  return (letters.length > 0 ? letters.join("") : person.email.slice(0, 2)).toUpperCase();
}
