/**
 * The bell in the topbar, and the drawer it opens.
 *
 * WHAT is a notification is not decided here. `useNotifications` builds the
 * list from the DMS modules (follow-ups due, service visits, open complaints,
 * pending call requests) and keeps which ones have been read. This file only
 * draws that list and lets somebody narrow it.
 *
 * The narrowing is a dropdown on the "All" button, as Zoho's is, rather than a
 * row of tabs: six tabs do not fit across a 400px drawer without scrolling
 * sideways, and the one that is selected is the only one worth showing.
 */

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  AlertTriangleIcon,
  BellIcon,
  CalendarIcon,
  CheckCheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  InboxIcon,
  PhoneCallIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  useNotifications,
  type AppNotification,
  type NotificationType,
} from "../hooks/useNotifications";
import { DrawerClose, DrawerTitle, TopbarDrawer } from "./TopbarDrawer";
import styles from "./NotificationMenu.module.css";

interface Props {
  orgSlug: string;
}

type Filter = "all" | "unread" | NotificationType;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "followup", label: "Follow-ups" },
  { value: "service", label: "Visits" },
  { value: "complaint", label: "Complaints" },
  { value: "call", label: "Calls" },
];

const KIND: Record<NotificationType, { label: string; Icon: typeof BellIcon }> = {
  followup: { label: "Follow-up", Icon: CalendarIcon },
  service: { label: "Visit", Icon: WrenchIcon },
  complaint: { label: "Complaint", Icon: AlertTriangleIcon },
  call: { label: "Call", Icon: PhoneCallIcon },
};

export function NotificationMenu({ orgSlug }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const { notifications, unreadCount, readIds, markAsRead, markAllAsRead } =
    useNotifications(orgSlug);

  const isUnread = (n: AppNotification) => !readIds.has(n.id);

  function matches(n: AppNotification, value: Filter) {
    if (value === "all") return true;
    if (value === "unread") return isUnread(n);
    return n.type === value;
  }

  const countFor = (value: Filter) => notifications.filter((n) => matches(n, value)).length;
  const shown = notifications.filter((n) => matches(n, filter));
  const current = FILTERS.find((f) => f.value === filter) ?? FILTERS[0]!;

  function changeOpen(next: boolean) {
    setOpen(next);
    // Somebody opening the bell expects everything, not the filter they left
    // on last time with nothing saying so.
    if (!next) setFilter("all");
  }

  function openNotification(notification: AppNotification) {
    markAsRead(notification.id);
    changeOpen(false);
    void navigate(notification.path);
  }

  return (
    <TopbarDrawer
      open={open}
      onOpenChange={changeOpen}
      triggerLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
      tooltip="Notifications"
      triggerClassName={styles.bellButton}
      triggerContent={
        <>
          <BellIcon size={18} aria-hidden="true" />
          {unreadCount > 0 && (
            <span className={styles.badge} aria-hidden="true">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </>
      }
    >
      <div className={styles.head}>
        <div className={styles.titleRow}>
          <DrawerTitle className={styles.title}>Notifications</DrawerTitle>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Mark all as read"
            title="Mark all as read"
            disabled={unreadCount === 0}
            onClick={() => markAllAsRead(notifications.map((n) => n.id))}
          >
            <CheckCheckIcon size={18} aria-hidden="true" />
          </button>
          <span className={styles.divider} aria-hidden="true" />
          <DrawerClose className={styles.close} aria-label="Close notifications">
            <XIcon size={18} aria-hidden="true" />
          </DrawerClose>
        </div>

        {/*
          Not portalled: inside the drawer it stacks over the list with no
          z-index of its own, and Radix still counts a click in it as a click
          inside the drawer, so choosing a filter does not close the drawer.
        */}
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger className={styles.filter} aria-label={`Show: ${current.label}`}>
            <span className={styles.filterLabel}>{current.label}</span>
            {countFor(filter) > 0 && <span className={styles.count}>{countFor(filter)}</span>}
            <span className={styles.filterDivider} aria-hidden="true" />
            <ChevronDownIcon size={16} className={styles.caret} aria-hidden="true" />
          </DropdownMenu.Trigger>

          <DropdownMenu.Content className={styles.menu} align="start" sideOffset={4}>
            <DropdownMenu.RadioGroup
              value={filter}
              onValueChange={(value) => setFilter(value as Filter)}
            >
              {FILTERS.map((option) => (
                <DropdownMenu.RadioItem
                  key={option.value}
                  value={option.value}
                  className={styles.menuItem}
                >
                  <span>{option.label}</span>
                  <span className={styles.menuCount}>{countFor(option.value)}</span>
                </DropdownMenu.RadioItem>
              ))}
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>

      <div className={styles.body}>
        {shown.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">
              <InboxIcon size={32} />
            </span>
            <p className={styles.emptyTitle}>
              {notifications.length === 0
                ? "No notifications at the moment"
                : filter === "unread"
                  ? "You are all caught up"
                  : `No ${current.label.toLowerCase()} right now`}
            </p>
            <p className={styles.emptyText}>
              Follow-ups due, service visits, open complaints and call requests show up here.
            </p>
          </div>
        ) : (
          <ul className={styles.list}>
            {shown.map((notification) => {
              const unread = isUnread(notification);
              const { label, Icon } = KIND[notification.type];
              return (
                <li key={notification.id}>
                  <button
                    type="button"
                    className={styles.item}
                    data-unread={unread || undefined}
                    onClick={() => openNotification(notification)}
                  >
                    <span className={styles.kindIcon} data-kind={notification.type} aria-hidden="true">
                      <Icon size={17} />
                    </span>
                    <span className={styles.itemText}>
                      <span className={styles.itemTitle}>{notification.title}</span>
                      <span className={styles.itemSubtitle}>{notification.subtitle}</span>
                      {notification.details && (
                        <span className={styles.itemDetails}>{notification.details}</span>
                      )}
                      <span className={styles.itemMeta}>
                        <span className={styles.due} data-urgency={notification.urgency}>
                          {notification.dueLabel}
                        </span>
                        <span>{label}</span>
                      </span>
                    </span>
                    {unread ? (
                      <span className={styles.unreadDot}>
                        <span className={styles.visuallyHidden}>Unread</span>
                      </span>
                    ) : (
                      <ChevronRightIcon size={16} className={styles.chevron} aria-hidden="true" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </TopbarDrawer>
  );
}
