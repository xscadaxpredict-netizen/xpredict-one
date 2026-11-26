/**
 * NEW TERRITORY and EDIT TERRITORY -- one form, its OWN PAGE (the owner,
 * 2026-11-24: New as a page, and Edit the same, Q78), as on the design canvas:
 * a back arrow, then two cards -- Territory details, Tax and contact -- and
 * Save / Cancel.
 *
 * New: name, kind, where it sits (only the places that kind may sit, from
 * `ALLOWED_PARENTS`), code; then GSTIN (a dealer needs one), PAN (taken from
 * the GSTIN unless typed), contact and address.
 *
 * Edit: the same, but kind and place are SHOWN, not changed -- a kind never
 * changes, and moving a territory comes in a later step. The organisation
 * itself is never edited here.
 *
 * THE SERVER DECIDES (C19). These checks only say early what it would refuse;
 * whatever it refuses anyway is shown on the field it names, or above the form.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { asProblem } from "@xpredict/api-client";
import { ErrorState } from "@xpredict/ui";
import { ArrowLeftIcon } from "lucide-react";

import {
  extractPan,
  isValidGstin,
  isValidPan,
  normaliseIdentifier,
} from "../../../shell/admin/gstin";
import page from "../../../shell/admin/screens/NewRoleScreen.module.css";
import { listPageStyles as listStyles } from "@xpredict/ui";
import { Button } from "../../../shell/components/Button";
import { FormBanner } from "../../../shell/components/FormBanner";
import { useShellContext } from "../../../shell/context";
import {
  ALLOWED_PARENTS,
  KIND_LABEL,
  NEW_KINDS,
  PARENT_HINT,
  type DmsTerritory,
  type NewTerritoryKind,
  type TerritoryDetails,
} from "./territories";
import { buildTree, territoryLabel, type Tree, type TreeNode } from "./territoryTree";
import { useCreateTerritory, useDmsTerritories, useUpdateTerritory } from "./useTerritories";
import styles from "./TerritoryForm.module.css";

interface TerritoryFormScreenProps {
  mode: "new" | "edit";
}

export function TerritoryFormScreen({ mode }: TerritoryFormScreenProps) {
  const { membership } = useShellContext();
  const { territoryId } = useParams<{ territoryId: string }>();
  const { data: territories, isPending, isError, error, refetch } = useDmsTerritories();
  const tree = useMemo(() => buildTree(territories ?? []), [territories]);

  const treePath = `/${membership.org_slug}/dms/settings/territories`;
  const editing = mode === "edit";
  const node = territoryId ? tree.byId.get(territoryId) : undefined;
  const backPath = editing && territoryId ? `${treePath}/${territoryId}` : treePath;

  return (
    <div className={page.page}>
      <header className={page.header}>
        <div className={styles.headerRow}>
          <Link
            to={backPath}
            className={styles.back}
            aria-label={
              editing
                ? `Back to ${node?.territory.name ?? "the territory"}`
                : "Back to Territory Management"
            }
          >
            <ArrowLeftIcon size={18} aria-hidden="true" />
          </Link>
          <div>
            <h1 className={page.title}>{editing ? "Edit territory" : "New Territory"}</h1>
            <p className={styles.subtitle}>
              {editing
                ? node
                  ? whereItIs(node)
                  : " "
                : "Add a region, dealer, branch or warehouse to your DMS tree."}
            </p>
          </div>
        </div>
      </header>

      {isPending && <p className={listStyles.missing}>Loading the territory tree…</p>}

      {isError && (
        <ErrorState
          title="Could not load the territory tree"
          code={asProblem(error).code}
          traceId={asProblem(error).trace_id}
          onRetry={() => void refetch()}
        />
      )}

      {territories && editing && (!node || node.territory.is_root) && (
        <p className={listStyles.missing} role="status">
          {node
            ? "This is the organisation itself. It shows the organisation's name and is not edited here."
            : "That territory is not in the tree."}{" "}
          <Link to={treePath} className={listStyles.linkButton}>
            Back to the tree
          </Link>
        </p>
      )}

      {territories && (!editing || (node && !node.territory.is_root)) && (
        <TerritoryForm tree={tree} editing={node} treePath={treePath} backPath={backPath} />
      )}
    </div>
  );
}

/** "Dealer · in North" */
function whereItIs(node: TreeNode): string {
  return `${node.territory.name} · ${KIND_LABEL[node.territory.kind]} in ${
    node.parent?.territory.name ?? "—"
  }`;
}

type Fields = TerritoryDetails & { code: string };

const EMPTY: Fields = {
  name: "",
  code: "",
  gstin: "",
  pan: "",
  contact_person: "",
  email: "",
  phone: "",
  city: "",
  state: "",
  postal_code: "",
};

function fieldsOf(territory: DmsTerritory): Fields {
  return {
    name: territory.name,
    code: territory.code ?? "",
    gstin: territory.gstin,
    pan: territory.pan,
    contact_person: territory.contact_person,
    email: territory.email,
    phone: territory.phone,
    city: territory.city,
    state: territory.state,
    postal_code: territory.postal_code,
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface TerritoryFormProps {
  tree: Tree;
  /** The box being edited; undefined for New Territory. */
  editing: TreeNode | undefined;
  treePath: string;
  backPath: string;
}

function TerritoryForm({ tree, editing, treePath, backPath }: TerritoryFormProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { mutateAsync: create, isPending: creating } = useCreateTerritory();
  const { mutateAsync: update, isPending: updating } = useUpdateTerritory();

  const [values, setValues] = useState<Fields>(() =>
    editing ? fieldsOf(editing.territory) : EMPTY,
  );
  const [kind, setKind] = useState<NewTerritoryKind>(() => {
    const asked = searchParams.get("kind");
    return NEW_KINDS.includes(asked as NewTerritoryKind) ? (asked as NewTerritoryKind) : "dealer";
  });
  const [parentId, setParentId] = useState<string>(() => {
    if (editing) return editing.parent?.territory.id ?? "";
    const asked = searchParams.get("parent");
    return asked && tree.byId.has(asked) ? asked : (tree.root?.territory.id ?? "");
  });
  // The PAN follows the GSTIN until somebody types in it (the Dealers form's rule).
  const [panOverridden, setPanOverridden] = useState(
    () => values.pan !== "" && values.pan !== extractPan(normaliseIdentifier(values.gstin)),
  );
  const [errors, setErrors] = useState<Partial<Record<keyof Fields | "parent_id", string>>>({});
  const [banner, setBanner] = useState<{
    message: string;
    traceId?: string;
  } | null>(null);

  const theKind = editing ? editing.territory.kind : kind;
  const isDealer = theKind === "dealer";

  // Only the places this kind may sit, in tree order, indented by depth. When
  // editing, never itself or anything under it: that would cut it off the tree.
  const parentOptions = useMemo(() => {
    const own = new Set<string>();
    if (editing) {
      const stack = [editing];
      for (let node = stack.pop(); node; node = stack.pop()) {
        own.add(node.territory.id);
        stack.push(...node.children);
      }
    }
    const allowed = ALLOWED_PARENTS[theKind as NewTerritoryKind] ?? [];
    return [...tree.byId.values()].filter(
      (option) => allowed.includes(option.territory.kind) && !own.has(option.territory.id),
    );
  }, [tree, theKind, editing]);

  function set<K extends keyof Fields>(field: K, value: Fields[K]) {
    setValues((current) => {
      const next = { ...current, [field]: value };
      if (field === "gstin" && !panOverridden) {
        next.pan = extractPan(normaliseIdentifier(String(value)));
      }
      return next;
    });
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function changeKind(next: NewTerritoryKind) {
    setKind(next);
    // A place the new kind may not sit is replaced by the first it may.
    const current = tree.byId.get(parentId);
    if (!current || !ALLOWED_PARENTS[next].includes(current.territory.kind)) {
      const first = [...tree.byId.values()].find((option) =>
        ALLOWED_PARENTS[next].includes(option.territory.kind),
      );
      setParentId(first?.territory.id ?? "");
    }
    setErrors({});
  }

  function check(): boolean {
    const found: typeof errors = {};
    const gstin = normaliseIdentifier(values.gstin);
    const pan = normaliseIdentifier(values.pan);

    if (!values.name.trim()) found.name = "Enter a name for this territory.";
    else if (values.name.trim().length > 200) found.name = "Keep the name under 200 characters.";
    // Required since 2026-11-26: every number filed here carries it (ENQ/DLM/26-27/0001).
    const code = values.code.trim().toUpperCase();
    if (!code) found.code = "Enter a code: it appears in every number filed here.";
    else if (!/^[A-Z0-9][A-Z0-9-]{1,9}$/.test(code))
      found.code = "A code is 2 to 10 letters, digits or hyphens, like DLM-01.";
    if (!editing && !parentId) found.parent_id = "Choose where it sits.";
    if (isDealer && !gstin) found.gstin = "A dealer needs its GSTIN.";
    else if (gstin && !isValidGstin(gstin)) {
      found.gstin = "That GSTIN is not valid. Check it against the certificate.";
    }
    if (pan && !isValidPan(pan)) {
      found.pan = "A PAN is five letters, four digits and one letter — AAPFU0939F.";
    }
    if (values.email.trim() && !EMAIL.test(values.email.trim())) {
      found.email = "Enter a valid email address.";
    }

    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function save() {
    setBanner(null);
    if (!check()) return;

    const details: TerritoryDetails = {
      name: values.name.trim(),
      code: values.code.trim().toUpperCase(),
      gstin: normaliseIdentifier(values.gstin),
      pan: normaliseIdentifier(values.pan),
      contact_person: values.contact_person.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      city: values.city.trim(),
      state: values.state.trim(),
      postal_code: values.postal_code.trim(),
    };

    try {
      if (editing) {
        // THE PARENT GOES WITH THE SAVE: a new one moves it (no separate Move).
        await update({
          territoryId: editing.territory.id,
          body: { ...details, parent_id: parentId },
        });
        void navigate(backPath);
      } else {
        const created = await create({ ...details, kind, parent_id: parentId });
        // Straight to the new box, open beside the tree.
        void navigate(`${treePath}/${created.id}`);
      }
    } catch (failure) {
      const problem = asProblem(failure);
      const onFields: typeof errors = {};
      const elsewhere: string[] = [];
      for (const item of problem.errors ?? []) {
        if (item.field in EMPTY || item.field === "parent_id") {
          onFields[item.field as keyof typeof errors] = item.detail;
        } else {
          elsewhere.push(item.detail);
        }
      }
      setErrors(onFields);
      if (Object.keys(onFields).length === 0 || elsewhere.length > 0) {
        setBanner({
          message: elsewhere[0] ?? problem.detail,
          traceId: problem.status >= 500 ? problem.trace_id : undefined,
        });
      }
    }
  }

  const saving = creating || updating;

  return (
    <>
      <form
        className={page.body}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        id="territory-form"
      >
        <div className={styles.form}>
          {banner && <FormBanner traceId={banner.traceId}>{banner.message}</FormBanner>}

          <section aria-labelledby="territory-details-title" className={page.card}>
            <h2 id="territory-details-title" className={styles.cardTitle}>
              Territory details
            </h2>
            <div className={`${page.pair} ${styles.two}`}>
              <Field id="territory-name" label="Name" required error={errors.name}>
                <input
                  id="territory-name"
                  type="text"
                  maxLength={200}
                  value={values.name}
                  onChange={(event) => set("name", event.target.value)}
                  className={page.input}
                  {...invalid("territory-name", errors.name)}
                />
              </Field>

              {editing ? (
                <Field id="territory-kind" label="Kind" hint="A territory's kind does not change.">
                  <span id="territory-kind" className={styles.readOnly}>
                    {KIND_LABEL[editing.territory.kind]}
                  </span>
                </Field>
              ) : (
                <Field id="territory-kind" label="Kind" required>
                  <select
                    id="territory-kind"
                    value={kind}
                    onChange={(event) => changeKind(event.target.value as NewTerritoryKind)}
                    className={page.input}
                  >
                    {NEW_KINDS.map((option) => (
                      <option key={option} value={option}>
                        {KIND_LABEL[option]}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

                <Field
                  id="territory-parent"
                  label="Parent territory"
                  required
                  error={errors.parent_id}
                  hint={
                    editing
                      ? `${PARENT_HINT[editing.territory.kind as NewTerritoryKind]} Changing it moves ${editing.territory.name} and everything under it; people keep their places.`
                      : parentOptions.length > 0
                        ? PARENT_HINT[kind]
                        : `${PARENT_HINT[kind]} Add one first.`
                  }
                >
                  <select
                    id="territory-parent"
                    value={parentId}
                    onChange={(event) => {
                      setParentId(event.target.value);
                      setErrors((current) => ({
                        ...current,
                        parent_id: undefined,
                      }));
                    }}
                    className={page.input}
                    {...invalid("territory-parent", errors.parent_id)}
                  >
                    {parentOptions.length === 0 && <option value="">Nothing to choose yet</option>}
                    {parentOptions.map((option) => (
                      <option key={option.territory.id} value={option.territory.id}>
                        {territoryLabel(option)}
                      </option>
                    ))}
                  </select>
                </Field>

              <Field
                id="territory-code"
                label="Code"
                error={errors.code}
                hint="Required. 2 to 10 letters, digits or hyphens, unique in your tree. Every number filed here carries it: ENQ/DLM/26-27/0001."
              >
                <input
                  id="territory-code"
                  type="text"
                  maxLength={10}
                  required
                  value={values.code}
                  onChange={(event) => set("code", event.target.value)}
                  className={page.input}
                  {...invalid("territory-code", errors.code)}
                />
              </Field>
            </div>
          </section>

          <section aria-labelledby="territory-tax-title" className={page.card}>
            <h2 id="territory-tax-title" className={styles.cardTitle}>
              Tax and contact
            </h2>
            <div className={`${page.pair} ${styles.two}`}>
              <Field
                id="territory-gstin"
                label="GSTIN"
                required={isDealer}
                error={errors.gstin}
                hint={isDealer ? "Needed for a dealer." : "Optional for this kind."}
              >
                <input
                  id="territory-gstin"
                  type="text"
                  maxLength={15}
                  placeholder="33AAPFU0939F1Z2"
                  value={values.gstin}
                  onChange={(event) => set("gstin", event.target.value)}
                  className={`${page.input} ${styles.identifier}`}
                  {...invalid("territory-gstin", errors.gstin)}
                />
              </Field>

              <Field
                id="territory-pan"
                label="PAN"
                error={errors.pan}
                hint={
                  panOverridden
                    ? "Typed by hand. Clear it to go back to the one in the GSTIN."
                    : "Taken from the GSTIN. Change it if this PAN differs."
                }
              >
                <input
                  id="territory-pan"
                  type="text"
                  maxLength={10}
                  placeholder="AAPFU0939F"
                  value={values.pan}
                  onChange={(event) => {
                    setPanOverridden(true);
                    set("pan", event.target.value);
                  }}
                  onBlur={(event) => {
                    if (event.target.value.trim() === "") {
                      setPanOverridden(false);
                      set("pan", extractPan(normaliseIdentifier(values.gstin)));
                    }
                  }}
                  className={`${page.input} ${styles.identifier}`}
                  {...invalid("territory-pan", errors.pan)}
                />
              </Field>

              <TextInput
                id="contact_person"
                label="Contact person"
                values={values}
                set={set}
                errors={errors}
              />
              <TextInput
                id="email"
                label="Email"
                type="email"
                values={values}
                set={set}
                errors={errors}
              />
              <TextInput
                id="phone"
                label="Phone"
                type="tel"
                values={values}
                set={set}
                errors={errors}
              />
              <TextInput id="city" label="City" values={values} set={set} errors={errors} />
              <TextInput id="state" label="State" values={values} set={set} errors={errors} />
              <TextInput id="postal_code" label="PIN" values={values} set={set} errors={errors} />
            </div>
          </section>
        </div>
      </form>

      <footer className={page.footer}>
        <Button type="submit" form="territory-form" isLoading={saving}>
          {saving ? "Saving…" : editing ? "Save changes" : "Save"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => void navigate(backPath)}>
          Cancel
        </Button>
      </footer>
    </>
  );
}


function invalid(id: string, error: string | undefined) {
  return error ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` } : {};
}

interface FieldProps {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}

function Field({ id, label, required, error, hint, children }: FieldProps) {
  return (
    <div className={page.field}>
      <label htmlFor={id} className={page.label}>
        {label} {required && <span className={page.required}>*</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className={page.fieldError}>
          {error}
        </p>
      ) : (
        hint && <p className={styles.hint}>{hint}</p>
      )}
    </div>
  );
}

type PlainField = "contact_person" | "email" | "phone" | "city" | "state" | "postal_code";

interface TextInputProps {
  id: PlainField;
  label: string;
  type?: string;
  values: Fields;
  set: (field: PlainField, value: string) => void;
  errors: Partial<Record<string, string>>;
}

function TextInput({ id, label, type = "text", values, set, errors }: TextInputProps) {
  const domId = `territory-${id}`;
  return (
    <Field id={domId} label={label} error={errors[id]}>
      <input
        id={domId}
        type={type}
        value={values[id]}
        onChange={(event) => set(id, event.target.value)}
        className={page.input}
        {...invalid(domId, errors[id])}
      />
    </Field>
  );
}
