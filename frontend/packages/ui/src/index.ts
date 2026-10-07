/**
 * Shared component library (C8: Radix primitives + CSS Modules).
 *
 * Everything used by more than one product lives here. Products import from
 * this package and never from each other.
 *
 * THE RULE OF TWO governs what arrives: a component that one module needs is
 * built inside that module. It moves here when a SECOND module needs it, and
 * not before — promoting early gives you a component designed from one use
 * case, which then grows a prop for every later caller and becomes
 * unmaintainable. Two real callers is the smallest number that shows you the
 * shape it actually has to have.
 */

export { TableSkeleton, EmptyState, ErrorState } from "./states";
export { DetailPanel } from "./DetailPanel";
// Three callers on arrival — Users, Dealers and Roles all explain themselves
// the same way — so it starts here rather than in one screen (the rule of two).
export { InfoHint } from "./InfoHint";
export type { InfoHintProps } from "./InfoHint";
