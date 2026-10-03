import React, { useState } from 'react';
import type { MemoryImpactDTO } from '@antislop/protocol';

export interface MemoryProfileViewProps {
  memoryImpact: MemoryImpactDTO;
}

export const MemoryProfileView: React.FC<MemoryProfileViewProps> = ({ memoryImpact }) => {
  const [expanded, setExpanded] = useState(false);

  const allocationLabels: Record<string, string> = {
    stack: 'Stack Frame Only',
    heap: 'Heap (Dynamic Alloc)',
    zero_alloc: 'Zero Allocation',
    gc_managed: 'GC Managed Heap',
    arena_pooled: 'Arena / Pooled Buffer',
    hybrid: 'Hybrid (Stack/Heap)',
  };

  const cacheLabels: Record<string, string> = {
    l1_optimal: 'L1 Cache Optimal',
    sequential_stride: 'Sequential Stride',
    pointer_chasing_poor: 'Pointer Chasing (Poor Cache Locality)',
    unaffected: 'Unaffected',
  };

  return (
    <div className="memory-profile-view">
      <div className="memory-profile-header">
        <button
          type="button"
          className="section-toggle-btn"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          <span className="icon">{expanded ? '▼' : '▶'}</span>
          <span className="title">Profil Alokasi Memori:</span>
          <span className={`allocation-badge badge-${memoryImpact.allocationType}`}>
            {allocationLabels[memoryImpact.allocationType] || memoryImpact.allocationType}
          </span>
          <span className={`cache-badge badge-${memoryImpact.cacheLocality}`}>
            {cacheLabels[memoryImpact.cacheLocality] || memoryImpact.cacheLocality}
          </span>
        </button>
      </div>

      {expanded && (
        <div className="memory-profile-details">
          <div className="memory-grid">
            <div className="memory-metric-item">
              <span className="metric-label">Estimasi Alokasi Heap:</span>
              <span className="metric-val">{memoryImpact.heapAllocationsEstimate}</span>
            </div>
            <div className="memory-metric-item">
              <span className="metric-label">Dampak Stack Frame:</span>
              <span className="metric-val">{memoryImpact.stackFrameImpact}</span>
            </div>
            <div className="memory-metric-item">
              <span className="metric-label">Siklus Garbage Collection:</span>
              <span className="metric-val">{memoryImpact.gcLifecycleImpact}</span>
            </div>
            <div className="memory-metric-item">
              <span className="metric-label">Lokalitas Cache:</span>
              <span className="metric-val">{cacheLabels[memoryImpact.cacheLocality]}</span>
            </div>
          </div>
          <div className="memory-notes">
            <strong>Catatan Tata Letak Memori:</strong> {memoryImpact.notes}
          </div>
        </div>
      )}
    </div>
  );
};
