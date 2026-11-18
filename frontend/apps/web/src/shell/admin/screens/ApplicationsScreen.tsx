/**
 * Admin panel -> App Management -> Applications (C78).
 *
 * Every app the organisation can have: its name, its owner and how many people
 * can open it. A filter chooses active (subscribed), inactive or all apps; the
 * TOPBAR's search box searches this list while the page is open ("Search
 * applications"), so there is no second search box here.
 *
 * Read-only. OWNER is the organisation's owner on every active app — the
 * owner's choice, 2026-11-17, until apps have owners of their own.
 *
 * PICKING A ROW OPENS THE APP BESIDE THE LIST (`ApplicationDetailPanel`), and
 * the address says which: `/admin/applications/crm`, so a refresh or a link
 * reopens it. The open app is looked up in the FULL list, not the filtered
 * one — narrowing the list is not a reason to close what you are reading.
 */

import { asProblem } from "@xpredict/api-client";
import { ErrorState, TableSkeleton } from "@xpredict/ui";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { usePageSearch } from "../../../stores/pageSearchStore";
import { useShellContext } from "../../context";
import { findApp } from "../../navigation";
import type { Application } from "../api/applications";
import { ApplicationActions } from "../components/ApplicationActions";
import { ApplicationDetailPanel } from "../components/ApplicationDetailPanel";
import { ListFilter } from "../components/ListFilter";
import { useApplications } from "../hooks/useApplications";
import styles from "./ListPage.module.css";

type Filter = "active" | "inactive" | "all";

const FILTERS = [
  { value: "active", label: "Active apps" },
  { value: "inactive", label: "Inactive apps" },
  { value: "all", label: "All apps" },
] as const;

const FILTER_WORD: Record<Filter, string> = { active: "active ", inactive: "inactive ", all: "" };

export function ApplicationsScreen() {
  const { data: apps, isPending, isError, error, refetch } = useApplications();
  const { membership } = useShellContext();
  const { appCode } = useParams<{ appCode: string }>();
  const navigate = useNavigate();
  const basePath = `/${membership.org_slug}/admin/applications`;
  const selected = appCode ? apps?.find((app) => app.code === appCode) : undefined;
  const query = usePageSearch((state) => state.query);
  const [filter, setFilter] = useState<Filter>("active");

  const needle = query.trim().toLowerCase();
  const shown = (apps ?? [])
    .filter((app) => filter === "all" || (filter === "active" ? app.active : !app.active))
    .filter(
      (app) =>
        needle === "" ||
        app.name.toLowerCase().includes(needle) ||
        (findApp(app.code)?.description.toLowerCase().includes(needle) ?? false),
    );

  /*
   * THE PAGE FILLS THE SCREEN AND NOTHING BELOW THE TOOLBAR SCROLLS THE PAGE --
   * the shape every Admin panel list page shares (`ListPage.module.css`).
   * Title and filter span the width; under them the list and the open app sit
   * side by side, both starting at the same line and both as tall as what is
   * left of the screen. Each scrolls inside itself — the table's body under
   * its fixed column headings, the panel's members under its fixed header
   * and tabs — so neither heading is ever scrolled away.
   */
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Applications</h1>

      <div className={styles.toolbar}>
        <ListFilter id="applications-filter" value={filter} options={FILTERS} onChange={setFilter} />
        {apps && (
          <span className={styles.count} aria-live="polite">
            {shown.length === 1 ? "1 app" : `${String(shown.length)} apps`}
          </span>
        )}
      </div>

      <div className={styles.split} data-detail={selected ? "" : undefined}>
        <div className={styles.listArea}>
          {isPending && (
            <TableSkeleton label="applications" columns={["grow", 240, 120]} rows={3} />
          )}

          {isError && (
            <ErrorState
              title="Could not load applications"
              code={asProblem(error).code}
              traceId={asProblem(error).trace_id}
              onRetry={() => void refetch()}
            />
          )}

          {apps && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">App name</th>
                    <th scope="col">Owner</th>
                    <th scope="col" className={styles.number}>
                      Members
                    </th>
                    <th scope="col" className={styles.actions}>
                      <span className={styles.visuallyHidden}>Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((app) => (
                    <ApplicationRow
                      key={app.code}
                      app={app}
                      href={`${basePath}/${app.code}`}
                      isOpen={app.code === selected?.code}
                      onOpen={() => void navigate(`${basePath}/${app.code}`)}
                    />
                  ))}
                </tbody>
              </table>

              {shown.length === 0 && (
                <p className={styles.empty}>
                  {needle
                    ? `No ${FILTER_WORD[filter]}apps match “${query.trim()}”.`
                    : `No ${FILTER_WORD[filter]}apps.`}
                </p>
              )}
            </div>
          )}

          {/* An address naming an app that is not on the list: said plainly. */}
          {appCode && apps && !selected && (
            <p className={styles.missing} role="status">
              That application isn&rsquo;t on this list.{" "}
              <Link to={basePath} className={styles.linkButton}>
                Back to all applications
              </Link>
            </p>
          )}
        </div>

        {selected && (
          <div className={styles.panelSlot}>
            {/* `key`: another app mounts a fresh panel, so its search starts empty. */}
            <ApplicationDetailPanel
              key={selected.code}
              app={selected}
              onClose={() => void navigate(basePath)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface ApplicationRowProps {
  app: Application;
  href: string;
  isOpen: boolean;
  onOpen: () => void;
}

function ApplicationRow({ app, href, isOpen, onOpen }: ApplicationRowProps) {
  // Copy, not data: the catalogue knows how to describe an app (C17's split).
  const definition = findApp(app.code);

  return (
    // The whole row opens the app; the name is also a real link, so a
    // keyboard reaches it and it can be opened in a new tab.
    <tr className={styles.row} data-open={isOpen || undefined} onClick={onOpen}>
      <th scope="row">
        <div className={styles.entity}>
          <span className={styles.badge} aria-hidden="true">
            {definition?.initials ?? app.name.slice(0, 2).toUpperCase()}
          </span>
          <div className={styles.stack}>
            <Link
              to={href}
              className={styles.primary}
              aria-current={isOpen ? "page" : undefined}
              onClick={(event) => event.stopPropagation()}
            >
              {app.name}
            </Link>
            {definition && <span className={styles.sub}>{definition.description}</span>}
          </div>
          {!app.active && <span className={styles.tag}>Not subscribed</span>}
        </div>
      </th>
      <td>
        {app.owner ? (
          <div className={styles.stack}>
            <span className={styles.primary}>{app.owner.name}</span>
            {app.owner.name !== app.owner.email && (
              <span className={styles.sub}>{app.owner.email}</span>
            )}
          </div>
        ) : (
          <span className={styles.none} aria-label="No owner">
            —
          </span>
        )}
      </td>
      <td className={styles.number}>{app.members}</td>
      <td className={styles.actions}>
        <ApplicationActions app={app} />
      </td>
    </tr>
  );
}
