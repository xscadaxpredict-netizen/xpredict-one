/**
 * DMS settings -> Security & Controls -> Territory Management (the owner,
 * 2026-11-24), as designed on the canvas: DMS's territory tree as a TOP-DOWN
 * CHART -- the organisation at the top, then regions, dealers, branches and
 * warehouses. Each box shows its kind, name and counts; a closed one is dashed
 * and says so; − / + under a box folds or unfolds what is below it.
 *
 * CLICKING A BOX opens it beside the chart (`TerritoryDetailPanel`) at
 * `territories/<id>`, in the same page format as DMS settings -> Users.
 * NEW TERRITORY is its own page (`territories/new`), as is Edit.
 *
 * THE TOPBAR'S BOX SEARCHES THE TREE: matching boxes are ringed, and anything
 * folded above one is opened so it can be seen.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { asProblem } from "@xpredict/api-client";
import { ErrorState, InfoHint } from "@xpredict/ui";

import { useAccess } from "../../../shell/access";
import { useShellContext } from "../../../shell/context";
import listStyles from "../../../shell/admin/screens/ListPage.module.css";
import { usePageSearch } from "../../../stores/pageSearchStore";
import { KIND_LABEL } from "./territories";
import { TerritoryDetailPanel } from "./TerritoryDetailPanel";
import { ancestorsOf, buildTree, countsLine, matchesSearch, type TreeNode } from "./territoryTree";
import { useDmsTerritories } from "./useTerritories";
import styles from "./TerritoryManagement.module.css";

export function TerritoryManagementScreen() {
  const { membership } = useShellContext();
  const { data: territories, isPending, isError, error, refetch } = useDmsTerritories();
  const query = usePageSearch((state) => state.query);
  const canCreate = useAccess().can("dms.territory.create");

  const { territoryId } = useParams<{ territoryId: string }>();
  const navigate = useNavigate();
  const basePath = `/${membership.org_slug}/dms/settings/territories`;

  const tree = useMemo(() => buildTree(territories ?? []), [territories]);
  const selected = territoryId ? tree.byId.get(territoryId) : undefined;

  // The boxes somebody has folded. Everything starts open.
  const [folded, setFolded] = useState<Set<string>>(() => new Set());

  // Opening a box by its address (a link, a refresh) unfolds whatever hides it.
  useEffect(() => {
    if (!selected) return;
    const above = ancestorsOf(selected);
    setFolded((current) =>
      above.some((id) => current.has(id))
        ? new Set([...current].filter((id) => !above.includes(id)))
        : current,
    );
  }, [selected]);

  // A search opens everything above a match, without forgetting what was folded.
  const matches = useMemo(
    () => [...tree.byId.values()].filter((node) => matchesSearch(node.territory, query)),
    [tree, query],
  );
  const forcedOpen = useMemo(() => new Set(matches.flatMap(ancestorsOf)), [matches]);

  function toggle(id: string) {
    setFolded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function collapseAll() {
    // Every box with something under it, except the organisation: the first
    // level stays in view.
    setFolded(
      new Set(
        [...tree.byId.values()]
          .filter((node) => node.children.length > 0 && !node.territory.is_root)
          .map((node) => node.territory.id),
      ),
    );
  }

  const total = tree.byId.size > 0 ? tree.byId.size - 1 : 0;

  return (
    <div className={listStyles.page}>
      <div className={listStyles.heading}>
        <h1 className={listStyles.title}>Territory Management</h1>
        <InfoHint label="About territories">
          Where DMS&rsquo;s work happens in {membership.org_name}: regions, dealers, branches and
          warehouses. People are placed at territories, and see the records there.
        </InfoHint>
      </div>

      <div className={listStyles.toolbar}>
        <button type="button" className={styles.toolButton} onClick={() => setFolded(new Set())}>
          Expand all
        </button>
        <button type="button" className={styles.toolButton} onClick={collapseAll}>
          Collapse all
        </button>
        {territories && (
          <span className={listStyles.count} aria-live="polite">
            {query.trim()
              ? `${String(matches.length)} ${matches.length === 1 ? "match" : "matches"}`
              : total === 1
                ? "1 territory"
                : `${String(total)} territories`}
          </span>
        )}
        <span className={styles.legend}>
          <span className={styles.legendSwatch} aria-hidden="true" />
          Closed
        </span>
        <span className={listStyles.spacer} />
        {canCreate ? (
          <Link to={`${basePath}/new`} className={listStyles.primaryButton}>
            <PlusIcon />
            New Territory
          </Link>
        ) : (
          <button
            type="button"
            className={listStyles.primaryButton}
            aria-disabled="true"
            title="You do not have permission to add territories"
          >
            <PlusIcon />
            New Territory
          </button>
        )}
      </div>

      <div className={listStyles.split} data-detail={selected ? "" : undefined}>
        <div className={listStyles.listArea}>
          {isPending && <p className={listStyles.missing}>Loading the territory tree…</p>}

          {isError && (
            <ErrorState
              title="Could not load the territory tree"
              code={asProblem(error).code}
              traceId={asProblem(error).trace_id}
              onRetry={() => void refetch()}
            />
          )}

          {tree.root && (
            <div className={styles.chart}>
              <section className={styles.tree} aria-label="DMS territory tree">
                <ul>
                  <Branch
                    node={tree.root}
                    selectedId={selected?.territory.id}
                    folded={folded}
                    forcedOpen={forcedOpen}
                    query={query}
                    onToggle={toggle}
                    onOpen={(id) => void navigate(`${basePath}/${id}`)}
                  />
                </ul>
              </section>
            </div>
          )}

          {query.trim() && territories && matches.length === 0 && (
            <p className={listStyles.empty}>No territories match “{query.trim()}”.</p>
          )}

          {/* An address naming a box that is not in the tree: a stale link. */}
          {territoryId && territories && !selected && (
            <p className={listStyles.missing} role="status">
              That territory is not in the tree.{" "}
              <Link to={basePath} className={listStyles.linkButton}>
                Back to the tree
              </Link>
            </p>
          )}
        </div>

        {selected && (
          <div className={listStyles.panelSlot}>
            {/* A NEW panel per box, so one box's error never shows on the next. */}
            <TerritoryDetailPanel
              key={selected.territory.id}
              node={selected}
              tree={tree}
              onClose={() => void navigate(basePath)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface BranchProps {
  node: TreeNode;
  selectedId: string | undefined;
  folded: Set<string>;
  forcedOpen: Set<string>;
  query: string;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}

/** One box and, unless folded, everything under it. */
function Branch({ node, selectedId, folded, forcedOpen, query, onToggle, onOpen }: BranchProps) {
  const { territory, children } = node;
  const hasChildren = children.length > 0;
  const open = hasChildren && (!folded.has(territory.id) || forcedOpen.has(territory.id));
  const closed = territory.status === "disabled";
  const isSelected = territory.id === selectedId;

  return (
    <li>
      <div className={styles.node}>
        <button
          type="button"
          className={styles.box}
          data-root={territory.is_root || undefined}
          data-closed={closed || undefined}
          data-match={matchesSearch(territory, query) || undefined}
          aria-current={isSelected ? "true" : undefined}
          onClick={() => onOpen(territory.id)}
        >
          <span className={styles.kind}>{KIND_LABEL[territory.kind]}</span>
          <span className={styles.boxName}>{territory.name}</span>
          <span className={styles.meta}>{countsLine(node)}</span>
          {closed && <span className={styles.closedTag}>Closed</span>}
        </button>
        {hasChildren && (
          <button
            type="button"
            className={styles.fold}
            aria-expanded={open}
            aria-label={`${open ? "Fold" : "Unfold"} ${territory.name}`}
            onClick={() => onToggle(territory.id)}
          >
            {open ? "−" : "+"}
          </button>
        )}
      </div>

      {open && (
        <ul>
          {children.map((child) => (
            <Branch
              key={child.territory.id}
              node={child}
              selectedId={selectedId}
              folded={folded}
              forcedOpen={forcedOpen}
              query={query}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
