/**
 * A settings page that is planned but not built (C78): its title, and a line
 * saying so. Each is replaced by the real screen, one sub-module at a time,
 * once the owner has said what it holds.
 */

import styles from "./SettingsPlaceholderScreen.module.css";

interface SettingsPlaceholderScreenProps {
  title: string;
}

export function SettingsPlaceholderScreen({ title }: SettingsPlaceholderScreenProps) {
  return (
    <section className={styles.page}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.body}>This page is being built.</p>
    </section>
  );
}
