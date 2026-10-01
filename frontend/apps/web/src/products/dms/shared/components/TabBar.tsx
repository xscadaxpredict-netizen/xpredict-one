import { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import styles from "./TabBar.module.css";

export interface Tab {
  id: string;
  label: string;
  path: string;
  icon?: ReactNode;
}

interface TabBarProps {
  tabs: Tab[];
}

export function TabBar({ tabs }: TabBarProps) {
  return (
    <div className={styles.container}>
      <nav className={styles.tabs} aria-label="Tabs">
        {tabs.map((tab) => (
          <NavLink
            key={tab.id}
            to={tab.path}
            end={tab.path === ""}
            className={({ isActive }) =>
              `${styles.tab} ${isActive ? styles.active : ""}`
            }
          >
            {tab.icon && <span className={styles.icon}>{tab.icon}</span>}
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
