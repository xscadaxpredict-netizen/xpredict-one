/**
 * A territory opened beside the tree (the owner, 2026-11-24): the same side
 * panel as DMS settings -> Users' person (`RecordPanel.module.css`) -- badge,
 * name, a line saying what and where it is, the ⋮ (`TerritoryActions`) -- and
 * ONE tab, Basic Info, in two foldable sections: Territory details, and Tax
 * and contact.
 */

import { useState, type ReactNode } from "react";
import { DetailPanel } from "@xpredict/ui";
import {
  BuildingIcon,
  ChevronDownIcon,
  CircleCheckIcon,
  FileTextIcon,
  GitForkIcon,
  HashIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  UserRoundIcon,
  UsersIcon,
} from "lucide-react";

import panel from "../../../shell/admin/components/RecordPanel.module.css";
import styles from "../../../shell/admin/components/UserDetailPanel.module.css";
import { KIND_LABEL } from "./territories";
import own from "./TerritoryManagement.module.css";
import { TerritoryActions } from "./TerritoryActions";
import { initialsOf, type TreeNode } from "./territoryTree";

interface TerritoryDetailPanelProps {
  node: TreeNode;
  onClose: () => void;
}

export function TerritoryDetailPanel({ node, onClose }: TerritoryDetailPanelProps) {
  const [statusError, setStatusError] = useState<string | null>(null);
  const { territory } = node;

  const where = territory.is_root
    ? "The organisation, at the top of the tree"
    : `${KIND_LABEL[territory.kind]} · in ${node.parent?.territory.name ?? "—"}`;

  return (
    <DetailPanel
      label={territory.name}
      onClose={onClose}
      header={
        <>
          <span className={panel.badge} aria-hidden="true">
            {initialsOf(territory.name)}
          </span>
          <div className={panel.heading}>
            <h2 className={panel.name}>{territory.name}</h2>
            <p className={panel.description}>{where}</p>
          </div>
          <TerritoryActions territory={territory} onStatusError={setStatusError} />
        </>
      }
    >
      <div className={panel.tabs} role="tablist" aria-label={`${territory.name} details`}>
        <button
          type="button"
          role="tab"
          id="territory-tab-info"
          aria-selected="true"
          aria-controls="territory-panel-info"
          className={panel.tab}
        >
          Basic Info
        </button>
      </div>

      <div
        role="tabpanel"
        id="territory-panel-info"
        aria-labelledby="territory-tab-info"
        className={panel.panel}
      >
        <div className={panel.scroll}>
          {statusError && (
            <p className={styles.error} role="alert">
              {statusError}
            </p>
          )}

          <div className={own.sections}>
            <Section id="territory-details" title="Territory details">
              <Fact icon={<CircleCheckIcon size={18} />} label="Status">
                <span
                  className={styles.status}
                  data-status={territory.status === "active" ? "active" : "disabled"}
                >
                  {territory.status === "active" ? "Active" : "Closed"}
                </span>
              </Fact>
              <Fact icon={<BuildingIcon size={18} />} label="Kind">
                <span>{KIND_LABEL[territory.kind]}</span>
              </Fact>
              {!territory.is_root && (
                <Fact icon={<GitForkIcon size={18} />} label="Sits under">
                  <Value text={node.parent?.territory.name} />
                </Fact>
              )}
              <Fact icon={<HashIcon size={18} />} label="Code">
                <Value text={territory.code} />
              </Fact>
              <Fact icon={<UsersIcon size={18} />} label="People here">
                <span>{String(territory.people_count)}</span>
                {node.below > 0 && (
                  <span className={styles.note}>
                    {`${String(node.people - territory.people_count)} more in the ${
                      node.below === 1 ? "territory" : `${String(node.below)} territories`
                    } under it.`}
                  </span>
                )}
              </Fact>
            </Section>

            <Section id="territory-tax-contact" title="Tax and contact">
              <Fact icon={<FileTextIcon size={18} />} label="GSTIN">
                <Value text={territory.gstin} />
              </Fact>
              <Fact icon={<FileTextIcon size={18} />} label="PAN">
                <Value text={territory.pan} />
              </Fact>
              <Fact icon={<UserRoundIcon size={18} />} label="Contact person">
                <Value text={territory.contact_person} />
              </Fact>
              <Fact icon={<MailIcon size={18} />} label="Email">
                <Value text={territory.email} />
              </Fact>
              <Fact icon={<PhoneIcon size={18} />} label="Phone">
                <Value text={territory.phone} />
              </Fact>
              <Fact icon={<MapPinIcon size={18} />} label="City">
                <Value text={territory.city} />
              </Fact>
              <Fact icon={<MapPinIcon size={18} />} label="State">
                <Value text={territory.state} />
              </Fact>
              <Fact icon={<MapPinIcon size={18} />} label="PIN">
                <Value text={territory.postal_code} />
              </Fact>
            </Section>
          </div>
        </div>
      </div>
    </DetailPanel>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionHeading}>
        <button
          type="button"
          className={styles.sectionToggle}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((shown) => !shown)}
        >
          <ChevronDownIcon size={16} aria-hidden="true" className={styles.chevron} />
          {title}
        </button>
      </h3>
      {open && (
        <dl id={id} className={styles.facts}>
          {children}
        </dl>
      )}
    </section>
  );
}

interface FactProps {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}

function Fact({ icon, label, children }: FactProps) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>
        <span className={styles.factIcon} aria-hidden="true">
          {icon}
        </span>
        {label}
      </dt>
      <dd className={styles.factValue}>{children}</dd>
    </div>
  );
}

function Value({ text }: { text: string | null | undefined }) {
  return text ? <span>{text}</span> : <span className={styles.unset}>—</span>;
}
