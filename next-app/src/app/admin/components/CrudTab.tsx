'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  AdminClientService,
  WhitelistedCrudEntity,
  WHITELISTED_CRUD_ENTITIES,
} from '@/lib/services/adminClient';
import { crudPrimaryKey } from '@/lib/admin/schemas';
import { NeoBadge } from '@/components/neo/NeoBadge';
import { NeoButton } from '@/components/neo/NeoButton';
import { NeoModal } from '@/components/neo/NeoModal';
import styles from '../admin.module.css';
import {
  DatabaseIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
  RefreshIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  CheckIcon,
  AlertTriangleIcon,
  EyeIcon,
} from './AdminIcons';

export interface CrudTabProps {
  capabilities: { canExecuteCrud: boolean };
  onNotify?: (msg: string, type: 'success' | 'error') => void;
}

export const CrudTab: React.FC<CrudTabProps> = ({ capabilities, onNotify }) => {
  const [selectedEntity, setSelectedEntity] = useState<WhitelistedCrudEntity>('spaces');
  const [records, setRecords] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Sorting & Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createJson, setCreateJson] = useState('{\n  \n}');
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingRecord, setEditingRecord] = useState<Record<string, unknown> | null>(null);
  const [editJson, setEditJson] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deletingRecord, setDeletingRecord] = useState<Record<string, unknown> | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // JSON inspection state
  const [inspectedJson, setInspectedJson] = useState<{ title: string; data: unknown } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Determine Primary Key for active entity
  const getPrimaryKey = (entity: WhitelistedCrudEntity): string => crudPrimaryKey(entity);

  const getRecordId = useCallback(
    (record: Record<string, unknown>, entity: WhitelistedCrudEntity): string => {
      const pk = getPrimaryKey(entity);
      return String(record[pk] || record.id || '');
    },
    []
  );

  // Fetch Entity Records
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await AdminClientService.getCrudRecords(selectedEntity, {
          page,
          limit: 20,
          sortOrder,
        });
        if (cancelled) return;
        setRecords((response.records as Array<Record<string, unknown>>) || []);
        setTotalPages(response.pagination.totalPages || 1);
        setTotalRecords(response.pagination.total || 0);
        setError(null);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to query database table.';
        setError(msg);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [selectedEntity, page, sortOrder, refreshTrigger]);

  const handleManualRefresh = () => {
    setLoading(true);
    setRefreshTrigger((v) => v + 1);
  };

  // Handle Entity Change
  const handleEntityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedEntity(e.target.value as WhitelistedCrudEntity);
    setPage(1);
    setLoading(true);
  };

  // Open Create Modal
  const openCreateModal = () => {
    let template: Record<string, unknown> = {};
    if (selectedEntity === 'spaces') {
      template = { name: 'New Virtual Lounge', slug: 'new-lounge', category: 'social', max_capacity: 50 };
    } else if (selectedEntity === 'worlds') {
      template = { name: 'Custom World', slug: 'custom-world', description: 'World description' };
    } else if (selectedEntity === 'space_settings') {
      template = { space_id: '', welcome_message: 'Welcome!', allow_guest_chat: true };
    } else if (selectedEntity === 'space_roles') {
      template = { space_id: '', name: 'Member', priority: 1, permissions: { can_chat: true } };
    } else {
      template = {};
    }

    setCreateJson(JSON.stringify(template, null, 2));
    setCreateError(null);
    setIsCreateOpen(true);
  };

  // Submit Create Record
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(createJson);
    } catch {
      setCreateError('Invalid JSON format. Please verify syntax.');
      return;
    }

    setCreateSaving(true);
    setCreateError(null);
    try {
      await AdminClientService.createCrudRecord(selectedEntity, payload);
      setIsCreateOpen(false);
      onNotify?.(`Record created in ${selectedEntity}`, 'success');
      handleManualRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create database record.';
      setCreateError(msg);
    } finally {
      setCreateSaving(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (record: Record<string, unknown>) => {
    setEditingRecord(record);
    // Exclude read-only fields for cleaner payload if appropriate
    setEditJson(JSON.stringify(record, null, 2));
    setEditError(null);
  };

  // Submit Edit Record
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(editJson);
    } catch {
      setEditError('Invalid JSON format. Please verify syntax.');
      return;
    }

    const recordId = getRecordId(editingRecord, selectedEntity);
    if (!recordId) {
      setEditError('Primary ID missing on target record.');
      return;
    }

    setEditSaving(true);
    setEditError(null);
    try {
      await AdminClientService.updateCrudRecord(selectedEntity, recordId, payload);
      setEditingRecord(null);
      onNotify?.(`Record updated in ${selectedEntity}`, 'success');
      handleManualRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update database record.';
      setEditError(msg);
    } finally {
      setEditSaving(false);
    }
  };

  // Open Delete Modal
  const openDeleteModal = (record: Record<string, unknown>) => {
    setDeletingRecord(record);
    setDeleteError(null);
  };

  // Submit Delete Record
  const handleDeleteSubmit = async () => {
    if (!deletingRecord) return;
    const recordId = getRecordId(deletingRecord, selectedEntity);

    setDeleteSaving(true);
    setDeleteError(null);
    try {
      await AdminClientService.deleteCrudRecord(selectedEntity, recordId);
      setDeletingRecord(null);
      onNotify?.(`Record deleted from ${selectedEntity}`, 'success');
      handleManualRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete record.';
      setDeleteError(msg);
    } finally {
      setDeleteSaving(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Infer Display Columns from Records (Max 6 primary columns)
  const computeDisplayColumns = () => {
    if (records.length === 0) return ['id'];
    const allKeys = Array.from(new Set(records.flatMap((r) => Object.keys(r))));
    const pk = getPrimaryKey(selectedEntity);

    // Prioritize standard keys
    const priority = [pk, 'name', 'title', 'slug', 'status', 'user_id', 'created_at', 'updated_at', 'joined_at'];
    const ordered = [
      ...priority.filter((k) => allKeys.includes(k)),
      ...allKeys.filter((k) => !priority.includes(k)),
    ];
    return ordered.slice(0, 6);
  };

  if (!capabilities.canExecuteCrud) {
    return (
      <div className={styles.guardCentering}>
        <div className={styles.guardCard}>
          <div className={styles.guardIconWrapper}>
            <AlertTriangleIcon size={32} color="#EF4444" />
          </div>
          <h2 className={styles.guardTitle}>Permission Restricted</h2>
          <p className={styles.guardBody}>
            Your administrator role does not possess the <code>canExecuteCrud</code> capability.
          </p>
        </div>
      </div>
    );
  }

  const columns = computeDisplayColumns();
  const pk = getPrimaryKey(selectedEntity);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Title & Toolbar */}
      <div className={styles.titleBar}>
        <div className={styles.titleColumn}>
          <h1 className={styles.pageHeadline}>Database CRUD Explorer</h1>
          <p className={styles.pageDescription}>
            Low-level inspection and administrative mutation across 15 whitelisted database entities.
          </p>
        </div>
        <div className={styles.titleActions}>
          <NeoButton variant="primary" onClick={openCreateModal}>
            <PlusIcon size={16} />
            <span>New Record</span>
          </NeoButton>
        </div>
      </div>

      {/* Toolbar: Entity Selector, Sort, Refresh */}
      <div className={styles.toolbarCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <DatabaseIcon size={18} color="var(--primary)" />
            <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>Table Entity:</span>
          </div>
          <select
            className={styles.filterSelect}
            value={selectedEntity}
            onChange={handleEntityChange}
            style={{ fontWeight: 800 }}
            aria-label="Select Whitelisted Entity"
          >
            {WHITELISTED_CRUD_ENTITIES.map((entity) => (
              <option key={entity} value={entity}>
                public.{entity}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterCluster}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)' }}>Order:</span>
            <select
              className={styles.filterSelect}
              value={sortOrder}
              onChange={(e) => {
                setSortOrder(e.target.value as 'asc' | 'desc');
                setLoading(true);
              }}
              aria-label="Sort Order"
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </div>

          <NeoButton
            variant="secondary"
            size="sm"
            onClick={handleManualRefresh}
            disabled={loading}
            title="Refresh Table"
          >
            <RefreshIcon size={16} className={loading ? styles.skeletonLoading : undefined} />
          </NeoButton>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          style={{
            backgroundColor: '#FEF2F2',
            border: '2px solid #EF4444',
            borderRadius: '8px',
            padding: '12px 14px',
            color: '#B91C1C',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertTriangleIcon size={18} color="#EF4444" />
          <span>{error}</span>
        </div>
      )}

      {/* Dynamic Records Table */}
      <div className={styles.tableEnvelope}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col}>{col === pk ? `${col} (PK)` : col}</th>
              ))}
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && records.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} style={{ textAlign: 'center', padding: '36px' }}>
                  <div className={styles.skeletonLoading}>Loading database records...</div>
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}
                >
                  No records stored in <code>{selectedEntity}</code>.
                </td>
              </tr>
            ) : (
              records.map((record, index) => {
                const recId = getRecordId(record, selectedEntity) || String(index);

                return (
                  <tr key={recId}>
                    {columns.map((col) => {
                      const val = record[col];

                      // 1. Null / Undefined
                      if (val === null || val === undefined) {
                        return (
                          <td key={col} style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            null
                          </td>
                        );
                      }

                      // 2. Boolean
                      if (typeof val === 'boolean') {
                        return (
                          <td key={col}>
                            <NeoBadge color={val ? '#22C55E' : '#71717A'} textColor="#FFFFFF">
                              {val ? 'TRUE' : 'FALSE'}
                            </NeoBadge>
                          </td>
                        );
                      }

                      // 3. Object / JSON
                      if (typeof val === 'object') {
                        const keysCount = Object.keys(val as Record<string, unknown>).length;
                        return (
                          <td key={col}>
                            <button
                              type="button"
                              className={styles.tableActionBtn}
                              style={{ width: 'auto', padding: '0 8px', fontSize: '0.75rem', fontWeight: 800 }}
                              onClick={() => setInspectedJson({ title: `${col} payload`, data: val })}
                              title="Inspect JSON Object"
                            >
                              <EyeIcon size={12} />
                              <span style={{ marginLeft: '4px' }}>JSON: {keysCount} keys</span>
                            </button>
                          </td>
                        );
                      }

                      // 4. UUID / Primary Key
                      const str = String(val);
                      if (str.length === 36 && str.includes('-')) {
                        return (
                          <td key={col}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                {str.slice(0, 8)}...
                              </span>
                              <button
                                type="button"
                                className={styles.tableActionBtn}
                                style={{ width: '24px', height: '24px' }}
                                onClick={() => copyToClipboard(str, `${recId}-${col}`)}
                                title="Copy Full UUID"
                              >
                                {copiedId === `${recId}-${col}` ? (
                                  <CheckIcon size={12} color="#22C55E" />
                                ) : (
                                  <CopyIcon size={12} />
                                )}
                              </button>
                            </div>
                          </td>
                        );
                      }

                      // 5. Standard Primitive
                      return (
                        <td
                          key={col}
                          style={{
                            maxWidth: '220px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {str}
                        </td>
                      );
                    })}

                    {/* Actions */}
                    <td>
                      <div className={styles.actionsCell}>
                        <button
                          type="button"
                          className={styles.tableActionBtn}
                          onClick={() => openEditModal(record)}
                          title="Edit Record JSON"
                        >
                          <EditIcon size={16} />
                        </button>
                        <button
                          type="button"
                          className={`${styles.tableActionBtn} ${styles.dangerAction}`}
                          onClick={() => openDeleteModal(record)}
                          title="Delete Record"
                        >
                          <TrashIcon size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      <div className={styles.paginationBar}>
        <span className={styles.pageInfoText}>
          Showing Page {page} of {totalPages} ({totalRecords} records in {selectedEntity})
        </span>
        <div className={styles.pageActionsGroup}>
          <NeoButton
            variant="secondary"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => {
              setPage((p) => Math.max(1, p - 1));
              setLoading(true);
            }}
          >
            <ChevronLeftIcon size={16} />
            <span>Prev</span>
          </NeoButton>
          <NeoButton
            variant="secondary"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => {
              setPage((p) => Math.min(totalPages, p + 1));
              setLoading(true);
            }}
          >
            <span>Next</span>
            <ChevronRightIcon size={16} />
          </NeoButton>
        </div>
      </div>

      {/* =========================================================================
         Modal 1: Create Record
         ========================================================================= */}
      <NeoModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title={`Insert Record: public.${selectedEntity}`}
        maxWidth="600px"
      >
        <form onSubmit={handleCreateSubmit} className={styles.formGrid}>
          {createError && (
            <div
              style={{
                backgroundColor: '#FEF2F2',
                border: '2px solid #EF4444',
                borderRadius: '8px',
                padding: '10px 14px',
                color: '#B91C1C',
                fontSize: '0.88rem',
                fontWeight: 700,
              }}
            >
              {createError}
            </div>
          )}

          <div className={styles.formFieldWrap}>
            <label className={styles.formLabel}>Record Payload (JSON Format) *</label>
            <textarea
              className={styles.formTextarea}
              rows={10}
              value={createJson}
              onChange={(e) => setCreateJson(e.target.value)}
              placeholder="{\n  key: value\n}"
              required
            />
          </div>

          <div className={styles.modalFooter}>
            <NeoButton variant="secondary" type="button" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </NeoButton>
            <NeoButton variant="primary" type="submit" disabled={createSaving}>
              {createSaving ? 'Inserting...' : 'Insert Record'}
            </NeoButton>
          </div>
        </form>
      </NeoModal>

      {/* =========================================================================
         Modal 2: Edit Record
         ========================================================================= */}
      <NeoModal
        isOpen={Boolean(editingRecord)}
        onClose={() => setEditingRecord(null)}
        title={
          editingRecord
            ? `Edit in public.${selectedEntity} (${getRecordId(editingRecord, selectedEntity).slice(0, 8)}...)`
            : 'Edit Record'
        }
        maxWidth="600px"
      >
        <form onSubmit={handleEditSubmit} className={styles.formGrid}>
          {editError && (
            <div
              style={{
                backgroundColor: '#FEF2F2',
                border: '2px solid #EF4444',
                borderRadius: '8px',
                padding: '10px 14px',
                color: '#B91C1C',
                fontSize: '0.88rem',
                fontWeight: 700,
              }}
            >
              {editError}
            </div>
          )}

          <div className={styles.formFieldWrap}>
            <label className={styles.formLabel}>Modified Record Payload (JSON)</label>
            <textarea
              className={styles.formTextarea}
              rows={12}
              value={editJson}
              onChange={(e) => setEditJson(e.target.value)}
              required
            />
          </div>

          <div className={styles.modalFooter}>
            <NeoButton variant="secondary" type="button" onClick={() => setEditingRecord(null)}>
              Cancel
            </NeoButton>
            <NeoButton variant="primary" type="submit" disabled={editSaving}>
              {editSaving ? 'Updating...' : 'Save Record Changes'}
            </NeoButton>
          </div>
        </form>
      </NeoModal>

      {/* =========================================================================
         Modal 3: Delete Record Confirmation
         ========================================================================= */}
      <NeoModal
        isOpen={Boolean(deletingRecord)}
        onClose={() => setDeletingRecord(null)}
        title="Confirm Record Deletion"
        maxWidth="480px"
      >
        <div className={styles.formGrid}>
          {deleteError && (
            <div
              style={{
                backgroundColor: '#FEF2F2',
                border: '2px solid #EF4444',
                borderRadius: '8px',
                padding: '10px 14px',
                color: '#B91C1C',
                fontSize: '0.88rem',
                fontWeight: 700,
              }}
            >
              {deleteError}
            </div>
          )}

          <p style={{ margin: 0, fontSize: '0.92rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
            Are you sure you want to permanently delete this record from table{' '}
            <strong>public.{selectedEntity}</strong>?
          </p>

          <div
            style={{
              padding: '12px',
              backgroundColor: 'var(--card-inner)',
              border: '1.5px solid var(--card-border)',
              borderRadius: '8px',
              fontFamily: 'monospace',
              fontSize: '0.82rem',
            }}
          >
            Target ID: {deletingRecord ? getRecordId(deletingRecord, selectedEntity) : ''}
          </div>

          <div className={styles.modalFooter}>
            <NeoButton variant="secondary" type="button" onClick={() => setDeletingRecord(null)}>
              Cancel
            </NeoButton>
            <NeoButton
              variant="danger"
              type="button"
              disabled={deleteSaving}
              onClick={handleDeleteSubmit}
            >
              {deleteSaving ? 'Deleting...' : 'Permanently Delete Record'}
            </NeoButton>
          </div>
        </div>
      </NeoModal>

      {/* =========================================================================
         Modal 4: JSON Field Inspector
         ========================================================================= */}
      <NeoModal
        isOpen={Boolean(inspectedJson)}
        onClose={() => setInspectedJson(null)}
        title={inspectedJson?.title || 'JSON Inspection'}
        maxWidth="560px"
      >
        {inspectedJson && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className={styles.jsonViewer}>
              {JSON.stringify(inspectedJson.data, null, 2)}
            </div>
            <div className={styles.modalFooter}>
              <NeoButton variant="secondary" onClick={() => setInspectedJson(null)}>
                Close
              </NeoButton>
            </div>
          </div>
        )}
      </NeoModal>
    </div>
  );
};
