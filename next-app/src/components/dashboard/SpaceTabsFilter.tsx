'use client';

import React from 'react';
import styles from './SpaceTabsFilter.module.css';

export type SpaceCategoryTab = 'all' | 'my' | 'discover' | 'favorites';

interface SpaceTabsFilterProps {
  activeTab: SpaceCategoryTab;
  onTabChange: (tab: SpaceCategoryTab) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  counts: {
    all: number;
    my: number;
    discover: number;
    favorites: number;
  };
}

export function SpaceTabsFilter({
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  counts,
}: SpaceTabsFilterProps) {
  const tabs: Array<{ id: SpaceCategoryTab; label: string; count: number }> = [
    { id: 'all', label: '🌐 All Worlds', count: counts.all },
    { id: 'my', label: '🏡 My Spaces', count: counts.my },
    { id: 'discover', label: '⭐ Discover', count: counts.discover },
    { id: 'favorites', label: '📌 Pinned', count: counts.favorites },
  ];

  return (
    <div className={styles.filterContainer}>
      <div className={styles.pillRow}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.filterPill} ${
              activeTab === tab.id ? styles.activePill : ''
            }`}
            onClick={() => onTabChange(tab.id)}
          >
            <span>{tab.label}</span>
            <span style={{ fontSize: '0.75rem', opacity: 0.75 }}>({tab.count})</span>
          </button>
        ))}
      </div>

      <div className={styles.searchWrap}>
        <input
          className={styles.searchInput}
          placeholder="Filter spaces by name or theme..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {searchQuery && (
          <button
            className={styles.clearSearch}
            onClick={() => onSearchChange('')}
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
