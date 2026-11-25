/**
 * DMS settings -> Masters -> PRODUCT CATALOG, in the shared list format (C78):
 * filters on the left, Add Product on the right, a table, a ⋮ per row, and a
 * product opening beside the list at its own address
 * (`/dms/settings/product-catalog/<id>`), as every list's records do.
 *
 * Was the second tab of "Load Master Data" (moved and restyled 2026-11-25).
 * The add / edit dialog is the old one, unchanged. Who may change what is the
 * old rule too: the organisation's own products are changed at organisation
 * level, a dealer's items only by that dealer.
 */

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { asProblem } from "@xpredict/api-client";
import {
  ConfirmDialog,
  DetailPanel,
  ErrorState,
  ListFilter,
  RowMenu,
  TableSkeleton,
  listPageStyles as listStyles,
  recordPanelStyles as panel,
} from "@xpredict/ui";

import { useShellContext } from "../../../shell/context";
import { usePageSearch } from "../../../stores/pageSearchStore";
import { useDeleteProductPreset, useProductPresets } from "../sales/hooks/useEnquiries";
import type { ProductPreset, QuoteType } from "../sales/api/types";
import { useDmsPermissions } from "../shared/hooks/useDmsPermissions";
import { Scope } from "./BankAccountsPage";
import { PlusIcon } from "./icons";
import { ProductModal } from "./ProductModal";
import styles from "./Masters.module.css";

type Belongs = "all" | "org" | "dealer";
type TypeFilter = "all" | QuoteType;

const BELONGS = [
  { value: "all", label: "All products" },
  { value: "org", label: "Organisation" },
  { value: "dealer", label: "Dealerships" },
] as const;

const TYPES = [
  { value: "all", label: "All types" },
  { value: "NORMAL", label: "Machines" },
  { value: "SPARES", label: "Spares" },
  { value: "AMC", label: "AMC" },
] as const;

const TYPE_LABEL: Record<QuoteType, string> = { NORMAL: "Machine", SPARES: "Spare", AMC: "AMC" };

function isOrgProduct(product: ProductPreset): boolean {
  return Boolean(product.is_global) || !product.unit_id;
}

function productName(product: ProductPreset): string {
  return product.name || product.description;
}

function money(value: number): string {
  return `₹${Number(value).toLocaleString("en-IN")}`;
}

export function ProductCatalogPage() {
  const { membership } = useShellContext();
  const { data: products, isPending, isError, error, refetch } = useProductPresets();
  const deleteProduct = useDeleteProductPreset();
  const { canManageProducts } = useDmsPermissions();
  const query = usePageSearch((state) => state.query);
  const [belongs, setBelongs] = useState<Belongs>("all");
  const [type, setType] = useState<TypeFilter>("all");
  const [editing, setEditing] = useState<ProductPreset | "new" | null>(null);
  const [deleting, setDeleting] = useState<ProductPreset | null>(null);

  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const basePath = `/${membership.org_slug}/dms/settings/product-catalog`;

  // The old rule: organisation level changes the organisation's products, a
  // dealer changes its own items.
  const atOrgLevel = !membership.unit_id;
  const canChange = (product: ProductPreset) =>
    canManageProducts && (atOrgLevel ? isOrgProduct(product) : !isOrgProduct(product));

  const shown = products?.filter((product) => {
    const scope = isOrgProduct(product) ? "org" : "dealer";
    return (
      (belongs === "all" || belongs === scope) &&
      (type === "all" || product.type === type) &&
      matches(product, query)
    );
  });
  const selected = productId ? products?.find((product) => product.id === productId) : undefined;

  const menu = (product: ProductPreset) => {
    const allowed = canChange(product);
    return (
      <RowMenu
        label={`More actions for ${productName(product)}`}
        items={[
          { label: "Edit", disabled: !allowed, onSelect: () => setEditing(product) },
          { label: "Delete", danger: true, disabled: !allowed, onSelect: () => setDeleting(product) },
        ]}
        note={allowed ? undefined : "A dealership's own items are changed by that dealership."}
      />
    );
  };

  return (
    <div className={listStyles.page}>
      <div className={listStyles.heading}>
        <h1 className={listStyles.title}>Product Catalog</h1>
      </div>

      <div className={listStyles.toolbar}>
        <ListFilter id="products-belongs" value={belongs} options={BELONGS} onChange={setBelongs} />
        <ListFilter id="products-type" value={type} options={TYPES} onChange={setType} />
        {shown && (
          <span className={listStyles.count} aria-live="polite">
            {shown.length === 1 ? "1 product" : `${String(shown.length)} products`}
          </span>
        )}
        <span className={listStyles.spacer} />
        <button
          type="button"
          className={listStyles.primaryButton}
          aria-disabled={canManageProducts ? undefined : "true"}
          title={canManageProducts ? undefined : "You do not have permission to add products"}
          onClick={() => canManageProducts && setEditing("new")}
        >
          <PlusIcon />
          Add Product
        </button>
      </div>

      <div className={listStyles.split} data-detail={selected ? "" : undefined}>
        <div className={listStyles.listArea}>
          {isPending && (
            <TableSkeleton label="products" columns={[260, 100, 100, 72, 120, 120, 56]} rows={5} />
          )}

          {isError && (
            <ErrorState
              title="Could not load products"
              code={asProblem(error).code}
              traceId={asProblem(error).trace_id}
              onRetry={() => void refetch()}
            />
          )}

          {shown && (
            <div className={listStyles.tableWrap}>
              <table className={listStyles.table}>
                <caption className={listStyles.visuallyHidden}>
                  The products offered on quotations. Select one to see its details.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Type</th>
                    <th scope="col">HSN</th>
                    <th scope="col" className={styles.numeric}>GST</th>
                    <th scope="col" className={styles.numeric}>Base price</th>
                    <th scope="col">Belongs to</th>
                    <th scope="col" className={listStyles.actions}>
                      <span className={listStyles.visuallyHidden}>Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((product) => {
                    const isOpen = product.id === selected?.id;
                    return (
                      <tr
                        key={product.id}
                        className={listStyles.row}
                        data-open={isOpen || undefined}
                        onClick={() => void navigate(`${basePath}/${product.id}`)}
                      >
                        <th scope="row">
                          <div className={listStyles.stack}>
                            <Link
                              to={`${basePath}/${product.id}`}
                              className={listStyles.primary}
                              aria-current={isOpen ? "page" : undefined}
                              onClick={(event) => event.stopPropagation()}
                            >
                              {productName(product)}
                            </Link>
                            {product.name && product.description && (
                              <span className={listStyles.sub}>{product.description}</span>
                            )}
                          </div>
                        </th>
                        <td>{TYPE_LABEL[product.type] ?? product.type}</td>
                        <td>{product.hsn || <span className={listStyles.none}>—</span>}</td>
                        <td className={styles.numeric}>{product.gst_rate}%</td>
                        <td className={styles.numeric}>{money(product.base_price)}</td>
                        <td>
                          <Scope org={isOrgProduct(product)} />
                        </td>
                        <td className={listStyles.actions} onClick={(event) => event.stopPropagation()}>
                          {menu(product)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {shown.length === 0 && (
                <p className={listStyles.empty}>
                  {products && products.length > 0 ? "No products match." : "No products yet."}
                </p>
              )}
            </div>
          )}

          {productId && products && !selected && (
            <p className={listStyles.missing} role="status">
              That product is no longer in the catalog.{" "}
              <Link to={basePath} className={listStyles.linkButton}>
                Back to all products
              </Link>
            </p>
          )}
        </div>

        {selected && (
          <div className={listStyles.panelSlot}>
            <DetailPanel
              key={selected.id}
              label={productName(selected)}
              onClose={() => void navigate(basePath)}
              header={
                <>
                  <div className={panel.heading}>
                    <h2 className={panel.name}>{productName(selected)}</h2>
                    <p className={panel.description}>{TYPE_LABEL[selected.type] ?? selected.type}</p>
                  </div>
                  {menu(selected)}
                </>
              }
            >
              <div className={panel.tabs} role="tablist" aria-label={`${productName(selected)} details`}>
                <button
                  type="button"
                  role="tab"
                  id="product-tab-details"
                  aria-selected="true"
                  aria-controls="product-panel-details"
                  className={panel.tab}
                >
                  Details
                </button>
              </div>
              <div
                role="tabpanel"
                id="product-panel-details"
                aria-labelledby="product-tab-details"
                className={panel.panel}
              >
                <div className={panel.scroll}>
                  <ProductDetails product={selected} />
                </div>
              </div>
            </DetailPanel>
          </div>
        )}
      </div>

      {editing && (
        <ProductModal open onClose={() => setEditing(null)} product={editing === "new" ? undefined : editing} />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete product"
        message={`Delete ${deleting ? productName(deleting) : "this product"} from the catalog? It will no longer be offered on quotations.`}
        intent="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleting) {
            deleteProduct.mutate(deleting.id);
            if (deleting.id === productId) void navigate(basePath);
          }
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function ProductDetails({ product }: { product: ProductPreset }) {
  return (
    <dl className={styles.details}>
      {product.image && (
        <div className={styles.wide}>
          <img src={product.image} alt={productName(product)} className={styles.productImage} />
        </div>
      )}
      <div>
        <dt>Type</dt>
        <dd>{TYPE_LABEL[product.type] ?? product.type}</dd>
      </div>
      <div>
        <dt>HSN</dt>
        <dd>{product.hsn || "—"}</dd>
      </div>
      <div>
        <dt>GST rate</dt>
        <dd>{product.gst_rate}%</dd>
      </div>
      <div>
        <dt>Margin</dt>
        <dd>{product.margin !== null && product.margin !== undefined ? `${product.margin}%` : "Set in the quote"}</dd>
      </div>
      <div>
        <dt>Base price</dt>
        <dd>{money(product.base_price)}</dd>
      </div>
      <div>
        <dt>Belongs to</dt>
        <dd>
          <Scope org={isOrgProduct(product)} />
        </dd>
      </div>
      <div className={styles.wide}>
        <dt>Description</dt>
        <dd>{product.description || "—"}</dd>
      </div>
      {product.specs && product.specs.length > 0 && (
        <div className={styles.wide}>
          <dt>Specifications</dt>
          <dd>
            <ul className={styles.specs}>
              {product.specs.map((spec) => (
                <li key={spec}>{spec}</li>
              ))}
            </ul>
          </dd>
        </div>
      )}
    </dl>
  );
}

function matches(product: ProductPreset, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [product.name ?? "", product.description, product.hsn].some((text) =>
    (text ?? "").toLowerCase().includes(q),
  );
}
