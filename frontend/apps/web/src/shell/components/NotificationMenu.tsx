import { useState } from "react";
import { useNavigate } from "react-router-dom";
import * as Popover from "@radix-ui/react-popover";
import {
  BellIcon,
  CalendarIcon,
  WrenchIcon,
  AlertTriangleIcon,
  PhoneCallIcon,
  CheckCheckIcon,
  CheckCircle2Icon,
  XIcon,
} from "lucide-react";
import { useNotifications, type NotificationType, type AppNotification } from "../hooks/useNotifications";
import styles from "./NotificationMenu.module.css";

interface Props {
  orgSlug: string;
}

export function NotificationMenu({ orgSlug }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | NotificationType>("all");

  const { notifications, unreadCount, readIds, markAsRead, markAllAsRead } = useNotifications(orgSlug);

  // Tab counts
  const followupCount = notifications.filter((n) => n.type === "followup").length;
  const serviceCount = notifications.filter((n) => n.type === "service").length;
  const complaintCount = notifications.filter((n) => n.type === "complaint").length;
  const callCount = notifications.filter((n) => n.type === "call").length;

  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === "all") return true;
    return n.type === activeTab;
  });

  const handleItemClick = (notification: AppNotification) => {
    markAsRead(notification.id);
    setOpen(false);
    navigate(notification.path);
  };

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case "followup":
        return (
          <div className={`${styles.iconWrapper} ${styles.iconFollowup}`}>
            <CalendarIcon size={16} />
          </div>
        );
      case "service":
        return (
          <div className={`${styles.iconWrapper} ${styles.iconService}`}>
            <WrenchIcon size={16} />
          </div>
        );
      case "complaint":
        return (
          <div className={`${styles.iconWrapper} ${styles.iconComplaint}`}>
            <AlertTriangleIcon size={16} />
          </div>
        );
      case "call":
        return (
          <div className={`${styles.iconWrapper} ${styles.iconCall}`}>
            <PhoneCallIcon size={16} />
          </div>
        );
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={styles.bellButton}
          aria-label="View notifications"
          title="Notifications"
        >
          <BellIcon size={18} />
          {unreadCount > 0 && (
            <span className={styles.badge}>{unreadCount > 9 ? "9+" : unreadCount}</span>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className={styles.panel}
          align="end"
          sideOffset={8}
          collisionPadding={12}
        >
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerTitle}>
              <span>Notifications</span>
              {notifications.length > 0 && (
                <span className={styles.headerCountBadge}>{notifications.length}</span>
              )}
            </div>

            <div className={styles.headerActions}>
              {notifications.length > 0 && (
                <button
                  type="button"
                  className={styles.markAllBtn}
                  onClick={() => markAllAsRead(notifications.map((n) => n.id))}
                  title="Mark all as read"
                >
                  <CheckCheckIcon size={13} style={{ display: "inline", marginRight: 3, verticalAlign: "middle" }} />
                  Mark all read
                </button>
              )}
              <Popover.Close className={styles.closeBtn} aria-label="Close notifications" title="Close">
                <XIcon size={16} />
              </Popover.Close>
            </div>
          </div>

          {/* Category Tabs */}
          <div className={styles.tabsRow}>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === "all" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("all")}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === "followup" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("followup")}
            >
              Follow-ups ({followupCount})
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === "service" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("service")}
            >
              Visits ({serviceCount})
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === "complaint" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("complaint")}
            >
              Complaints ({complaintCount})
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === "call" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("call")}
            >
              Calls ({callCount})
            </button>
          </div>

          {/* List Content */}
          <div className={styles.listWrapper}>
            {filteredNotifications.length === 0 ? (
              <div className={styles.emptyState}>
                <CheckCircle2Icon
                  size={28}
                  color="var(--color-success, #16a34a)"
                  style={{ margin: "0 auto 8px auto", display: "block" }}
                />
                No active notifications in this category. You are all caught up!
              </div>
            ) : (
              filteredNotifications.map((notif) => {
                const isUnread = !readIds.has(notif.id);
                return (
                  <div
                    key={notif.id}
                    className={`${styles.notificationItem} ${isUnread ? styles.unreadItem : ""}`}
                    onClick={() => handleItemClick(notif)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleItemClick(notif);
                      }
                    }}
                  >
                    {getIcon(notif.type)}
                    <div className={styles.itemContent}>
                      <div className={styles.itemHeader}>
                        <span className={styles.itemTitle}>{notif.title}</span>
                        <span
                          className={`${styles.dueBadge} ${
                            notif.urgency === "urgent"
                              ? styles.badgeUrgent
                              : notif.urgency === "warning"
                              ? styles.badgeWarning
                              : styles.badgeInfo
                          }`}
                        >
                          {notif.dueLabel}
                        </span>
                      </div>
                      <div className={styles.itemSubtitle}>{notif.subtitle}</div>
                      {notif.details && <div className={styles.itemDetails}>{notif.details}</div>}
                    </div>
                    {isUnread && <span className={styles.unreadDot} />}
                  </div>
                );
              })
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
