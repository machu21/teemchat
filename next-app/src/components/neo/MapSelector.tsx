'use client';

import React, { useState, useMemo, useRef } from 'react';
import styles from './MapSelector.module.css';
import { getAllMapConfigs, MapThemeId } from '@/game/map/mapRegistry';

interface MapSelectorProps {
  selectedTheme: string;
  onSelectTheme: (themeId: MapThemeId, category: string) => void;
  className?: string;
}

export const MapSelector: React.FC<MapSelectorProps> = ({
  selectedTheme,
  onSelectTheme,
  className = '',
}) => {
  const configs = getAllMapConfigs();
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const gridRef = useRef<HTMLDivElement | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    configs.forEach((c) => set.add(c.category));
    return ['All', ...Array.from(set)];
  }, [configs]);

  const filteredConfigs = useMemo(() => {
    if (activeCategory === 'All') return configs;
    return configs.filter((c) => c.category === activeCategory);
  }, [configs, activeCategory]);

  const selectedConfig = useMemo(() => {
    return configs.find((c) => c.id === selectedTheme) || configs[0];
  }, [configs, selectedTheme]);

  // Mobile scroll helper for left/right navigation
  const scrollCarousel = (direction: 'left' | 'right') => {
    if (!gridRef.current) return;
    const scrollAmount = gridRef.current.clientWidth * 0.8;
    gridRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  return (
    <div className={`${styles.selectorContainer} ${className}`}>
      {/* Header with Title and Count Badge */}
      <div className={styles.selectorHeader}>
        <div className={styles.selectorLabelGroup}>
          <label className={styles.selectorLabel}>Choose Map Theme & Environment</label>
          <span className={styles.selectorSubtitle}>Select a world template</span>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.countBadge}>
            {filteredConfigs.length} {filteredConfigs.length === 1 ? 'world' : 'worlds'}
          </span>
          {/* Mobile carousel arrows */}
          <div className={styles.mobileNavArrows}>
            <button
              type="button"
              className={styles.carouselArrowBtn}
              onClick={() => scrollCarousel('left')}
              title="Previous World"
              aria-label="Previous World"
            >
              ◀
            </button>
            <button
              type="button"
              className={styles.carouselArrowBtn}
              onClick={() => scrollCarousel('right')}
              title="Next World"
              aria-label="Next World"
            >
              ▶
            </button>
          </div>
        </div>
      </div>

      {/* Selected World Preview Callout (High visibility on mobile) */}
      {selectedConfig && (
        <div className={styles.selectedCallout}>
          <span className={styles.calloutIcon}>{selectedConfig.icon}</span>
          <div className={styles.calloutDetails}>
            <span className={styles.calloutLabel}>Active Environment:</span>
            <span className={styles.calloutName}>{selectedConfig.name}</span>
          </div>
          <span
            className={styles.calloutTag}
            style={{ borderColor: selectedConfig.badgeColor }}
          >
            {selectedConfig.category}
          </span>
        </div>
      )}

      {/* Quick Category Filter Tabs (Scrollable on Mobile) */}
      <div
        className={styles.categoryFilters}
        role="tablist"
        aria-label="Filter maps by category"
      >
        {categories.map((cat) => {
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`${styles.categoryTab} ${isActive ? styles.categoryTabActive : ''}`}
              onClick={() => {
                setActiveCategory(cat);
                if (gridRef.current) {
                  gridRef.current.scrollTo({ left: 0, behavior: 'smooth' });
                }
              }}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Responsive Map Grid / Mobile Reel */}
      <div
        ref={gridRef}
        className={styles.mapGrid}
        role="radiogroup"
        aria-label="Select Map Theme"
      >
        {filteredConfigs.map((config) => {
          const isSelected = selectedTheme === config.id;
          return (
            <button
              key={config.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              className={`${styles.mapCard} ${isSelected ? styles.mapCardSelected : ''}`}
              onClick={() => onSelectTheme(config.id, config.category)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectTheme(config.id, config.category);
                }
              }}
            >
              <div className={styles.cardHeader}>
                <div className={styles.cardTitleRow}>
                  <span className={styles.mapIcon} aria-hidden="true">
                    {config.icon}
                  </span>
                  <div className={styles.cardTitleText}>
                    <div className={styles.mapName} title={config.name}>
                      {config.name}
                    </div>
                    <span className={styles.categoryBadge}>{config.category}</span>
                  </div>
                </div>
                <div
                  className={`${styles.selectedIndicator} ${
                    isSelected ? styles.selectedIndicatorActive : ''
                  }`}
                  aria-hidden="true"
                >
                  {isSelected ? '✓' : ''}
                </div>
              </div>

              {/* High-contrast preview banner */}
              <div
                className={styles.previewBanner}
                style={{ background: config.previewGradient }}
              >
                <span className={styles.bannerTagline}>{config.tagline}</span>
              </div>

              <p className={styles.mapDesc}>{config.description}</p>

              {/* Highlights Zone Tags */}
              <div className={styles.highlightsList}>
                {config.highlights.map((h) => (
                  <span key={h} className={styles.highlightPill}>
                    {h}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Mobile Swipe Hint */}
      <div className={styles.mobileSwipeHint}>
        <span>👈 Swipe horizontally to view all worlds 👉</span>
      </div>
    </div>
  );
};

