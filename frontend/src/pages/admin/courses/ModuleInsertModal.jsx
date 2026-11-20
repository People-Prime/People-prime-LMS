import React, { useState, useEffect, useMemo, useRef } from 'react';
import { apiClient } from '../../../services/api';

// Inline SVG Icon Helpers
const Icons = {
  Close: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  BookOpen: ({ className = "w-5 h-5" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  Database: ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  ),
  Inbox: ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
    </svg>
  ),
  FileText: ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  Search: ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  Check: ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  Eye: ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ),
  UploadCloud: ({ className = "w-5 h-5" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
    </svg>
  ),
  Trash: ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  ),
  AlertCircle: ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Spinner: ({ className = "w-4 h-4" }) => (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
    </svg>
  )
};

export default function ModuleInsertModal({
  show,
  isOpen,
  course,
  level,
  levelModules,
  modules: propModules,
  submitting = false,
  onClose,
  onInsert,
  initialPosition = 'end',
  targetModule = null
}) {
  const isVisible = Boolean(show ?? isOpen);
  const effectiveModules = useMemo(() => {
    return Array.isArray(levelModules) ? levelModules : (Array.isArray(propModules) ? propModules : []);
  }, [levelModules, propModules]);

  // Mode selection: 'create' or 'repository'
  const [insertionMode, setInsertionMode] = useState('create');

  // Common Placement State
  const [position, setPosition] = useState(initialPosition);
  const [referenceModuleId, setReferenceModuleId] = useState(
    targetModule ? targetModule.id : (effectiveModules[0]?.id || '')
  );
  const [error, setError] = useState('');
  const [statusVal, setStatusVal] = useState('DRAFT');

  // Manual Mode: Single Module Form State
  const [singleName, setSingleName] = useState('');
  const [singleDescription, setSingleDescription] = useState('');
  const [singleDuration, setSingleDuration] = useState('');

  // Manual Mode: Local File Upload State
  const [uploadedFilesList, setUploadedFilesList] = useState([]); // Array of { file, moduleName, duration, description, status }
  const [uploadingProgress, setUploadingProgress] = useState(false);
  const fileInputRef = useRef(null);

  // Material Repository / Ingestion Bulk Selection State
  const [materialSource, setMaterialSource] = useState('repository'); // 'repository' | 'ingestion'
  const [trainingFiles, setTrainingFiles] = useState([]);
  const [fileMappings, setFileMappings] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [materialSearch, setMaterialSearch] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState('all');
  
  // Selected repository materials: Map of fileId -> { file, moduleName, duration, description }
  const [selectedMaterialsMap, setSelectedMaterialsMap] = useState({});

  // Clean filename for module name recommendation
  const cleanModuleName = (filename) => {
    if (!filename) return '';
    return filename
      .replace(/\.[^/.]+$/, '') // remove extension
      .replace(/[-_]+/g, ' ')   // replace dashes/underscores with spaces
      .trim();
  };

  // Prevent background scroll when modal is open
  useEffect(() => {
    if (isVisible) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isVisible]);

  // Reset form when modal opens or target changes
  useEffect(() => {
    if (isVisible) {
      setInsertionMode('create');
      setPosition(initialPosition);
      setReferenceModuleId(targetModule ? targetModule.id : (effectiveModules[0]?.id || ''));
      setError('');
      setStatusVal('DRAFT');
      setSingleName('');
      setSingleDescription('');
      setSingleDuration('');
      setUploadedFilesList([]);
      setSelectedMaterialsMap({});
      setMaterialSearch('');
      setFileTypeFilter('all');
      setMaterialSource('repository');
    }
  }, [isVisible, initialPosition, targetModule, effectiveModules]);

  // Fetch training files, mappings, and clusters when repository mode is activated
  useEffect(() => {
    if (isVisible && insertionMode === 'repository' && trainingFiles.length === 0) {
      fetchRepositoryData();
    }
  }, [isVisible, insertionMode, trainingFiles.length]);

  const fetchRepositoryData = async () => {
    setLoadingMaterials(true);
    try {
      const [filesRes, mappingsRes, clustersRes] = await Promise.all([
        apiClient('/admin/training-files/'),
        apiClient('/admin/training-file-mappings/'),
        apiClient('/admin/training-clusters/')
      ]);
      setTrainingFiles(Array.isArray(filesRes) ? filesRes : (filesRes?.data || []));
      setFileMappings(Array.isArray(mappingsRes) ? mappingsRes : (mappingsRes?.data || []));
      setClusters(Array.isArray(clustersRes) ? clustersRes : (clustersRes?.data || []));
    } catch (err) {
      console.error('Error loading repository materials:', err);
      setError('Failed to load training materials. Please check your connection.');
    } finally {
      setLoadingMaterials(false);
    }
  };

  // Build mapping counts & cluster associations
  const fileUsageMap = useMemo(() => {
    const map = {};
    (fileMappings || []).forEach(m => {
      const fId = m.training_file_id || m.file_id || m.training_file;
      if (fId) {
        if (!map[fId]) {
          map[fId] = { count: 0, clusters: new Set(), clusterCodes: new Set() };
        }
        map[fId].count += 1;
        if (m.cluster) map[fId].clusters.add(m.cluster);
        if (m.cluster_code) map[fId].clusterCodes.add(m.cluster_code);
      }
    });
    return map;
  }, [fileMappings]);

  // Filtered files based on source, search query, and file type
  const filteredFiles = useMemo(() => {
    const cluster9Id = clusters.find(c => c.code === 'CLUSTER-9')?.id;

    return (trainingFiles || []).filter(file => {
      const usage = fileUsageMap[file.id];
      const count = usage?.count || 0;
      const isCluster9 = usage ? (
        (cluster9Id && usage.clusters.has(cluster9Id)) || usage.clusterCodes.has('CLUSTER-9')
      ) : false;

      // Ingestion / Unassigned definition
      const isIngestion = count === 0 || isCluster9;
      if (materialSource === 'ingestion' && !isIngestion) return false;

      // File type filter
      if (fileTypeFilter !== 'all') {
        const ext = (file.file_type || file.filename?.split('.').pop() || '').toLowerCase();
        if (fileTypeFilter === 'pdf' && !ext.includes('pdf')) return false;
        if (fileTypeFilter === 'word' && !ext.includes('doc') && !ext.includes('docx')) return false;
        if (fileTypeFilter === 'presentation' && !ext.includes('ppt') && !ext.includes('pptx')) return false;
        if (fileTypeFilter === 'spreadsheet' && !ext.includes('xls') && !ext.includes('xlsx') && !ext.includes('csv')) return false;
      }

      // Search query filter
      if (materialSearch.trim()) {
        const query = materialSearch.toLowerCase();
        const fileName = (file.filename || file.name || '').toLowerCase();
        const relPath = (file.relative_path || '').toLowerCase();
        return fileName.includes(query) || relPath.includes(query);
      }

      return true;
    });
  }, [trainingFiles, fileUsageMap, clusters, materialSource, fileTypeFilter, materialSearch]);

  // Bulk Selection Handlers
  const toggleSelectMaterial = (file) => {
    setSelectedMaterialsMap(prev => {
      const next = { ...prev };
      if (next[file.id]) {
        delete next[file.id];
      } else {
        next[file.id] = {
          file,
          moduleName: cleanModuleName(file.filename || file.name),
          duration: 30,
          description: `Instructional content for ${cleanModuleName(file.filename || file.name)}`
        };
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedMaterialsMap(prev => {
      const next = { ...prev };
      filteredFiles.forEach(file => {
        if (!next[file.id]) {
          next[file.id] = {
            file,
            moduleName: cleanModuleName(file.filename || file.name),
            duration: 30,
            description: `Instructional content for ${cleanModuleName(file.filename || file.name)}`
          };
        }
      });
      return next;
    });
  };

  const clearAllSelected = () => {
    setSelectedMaterialsMap({});
  };

  const handleUpdateSelectedModuleName = (fileId, newName) => {
    setSelectedMaterialsMap(prev => {
      if (!prev[fileId]) return prev;
      return {
        ...prev,
        [fileId]: { ...prev[fileId], moduleName: newName }
      };
    });
  };

  // Local File Upload Handlers
  const handleFilesPicked = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const newItems = files.map(file => ({
      file,
      moduleName: cleanModuleName(file.name),
      duration: 30,
      description: `Course module covering ${cleanModuleName(file.name)}`,
      uploadStatus: 'ready'
    }));
    setUploadedFilesList(prev => [...prev, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveUploadedItem = (index) => {
    setUploadedFilesList(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateUploadedItemName = (index, newName) => {
    setUploadedFilesList(prev => {
      const next = [...prev];
      next[index] = { ...next[index], moduleName: newName };
      return next;
    });
  };

  const handlePreview = (e, file) => {
    e.stopPropagation();
    const downloadUrl = file.download_url || `/api/admin/training-files/${file.id}/download/?preview=true`;
    window.open(`/viewer?url=${encodeURIComponent(downloadUrl)}&title=${encodeURIComponent(file.filename || 'Document')}`, '_blank');
  };

  // Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if ((position === 'before' || position === 'after') && !referenceModuleId) {
      setError('Please select a reference module.');
      return;
    }

    const resolvedCourseId = course?.id ?? level?.course ?? null;

    // SCENARIO 1: Repository Bulk / Single Mode
    if (insertionMode === 'repository') {
      const selectedEntries = Object.values(selectedMaterialsMap);
      if (selectedEntries.length === 0) {
        setError('Please select at least one training material from the list below.');
        return;
      }

      for (const entry of selectedEntries) {
        if (!entry.moduleName.trim()) {
          setError(`Please provide a module name for '${entry.file.filename}'.`);
          return;
        }
      }

      const items = selectedEntries.map(entry => ({
        name: entry.moduleName.trim(),
        description: entry.description?.trim() || '',
        estimated_duration_minutes: parseInt(entry.duration || 0, 10),
        status: statusVal,
        training_file_id: entry.file.id
      }));

      const payload = {
        course: resolvedCourseId,
        level: level?.id || null,
        level_id: level?.id || null,
        course_id: resolvedCourseId,
        position,
        reference_module_id: (position === 'before' || position === 'after') ? parseInt(referenceModuleId, 10) : null,
        items
      };

      onInsert(payload);
      return;
    }

    // SCENARIO 2: Create Mode with Local File Uploads
    if (insertionMode === 'create' && uploadedFilesList.length > 0) {
      for (const item of uploadedFilesList) {
        if (!item.moduleName.trim()) {
          setError(`Please provide a module name for uploaded file '${item.file.name}'.`);
          return;
        }
      }

      setUploadingProgress(true);
      try {
        const formData = new FormData();
        uploadedFilesList.forEach(item => {
          formData.append('files', item.file);
          formData.append('relative_paths', item.file.name);
        });

        const uploadRes = await apiClient('/admin/training-files/upload/', {
          method: 'POST',
          body: formData,
        });

        const uploadedCreated = uploadRes?.created || [];
        const uploadedSkipped = uploadRes?.skipped || [];
        const uploadedFailed = uploadRes?.failed || [];

        if (uploadedFailed.length > 0 && uploadedCreated.length === 0 && uploadedSkipped.length === 0) {
          setError(`Upload rejected: ${uploadedFailed[0]?.error || 'Files could not be uploaded'}`);
          setUploadingProgress(false);
          return;
        }

        const items = [];
        for (const item of uploadedFilesList) {
          let matchedId = null;
          const foundCreated = uploadedCreated.find(c => c.filename === item.file.name);
          if (foundCreated) {
            matchedId = foundCreated.id;
          } else {
            const foundSkipped = uploadedSkipped.find(s => s.filename === item.file.name);
            if (foundSkipped) matchedId = foundSkipped.existing_id;
          }

          items.push({
            name: item.moduleName.trim(),
            description: item.description?.trim() || '',
            estimated_duration_minutes: parseInt(item.duration || 0, 10),
            status: statusVal,
            training_file_id: matchedId
          });
        }

        const payload = {
          course: resolvedCourseId,
          level: level?.id || null,
          level_id: level?.id || null,
          course_id: resolvedCourseId,
          position,
          reference_module_id: (position === 'before' || position === 'after') ? parseInt(referenceModuleId, 10) : null,
          items
        };

        setUploadingProgress(false);
        onInsert(payload);
      } catch (uploadErr) {
        setUploadingProgress(false);
        setError(`Failed to upload local files: ${uploadErr.message || 'Network error'}`);
      }
      return;
    }

    // SCENARIO 3: Create Mode — Pure Manual Single Module (No files)
    if (!singleName.trim()) {
      setError('Please enter a module name or select/upload training materials.');
      return;
    }

    const parsedDuration = parseInt(singleDuration || 0, 10);
    const payload = {
      course: resolvedCourseId,
      level: level?.id || null,
      level_id: level?.id || null,
      course_id: resolvedCourseId,
      name: singleName.trim(),
      description: singleDescription.trim(),
      estimated_duration_minutes: isNaN(parsedDuration) ? 0 : Math.max(0, parsedDuration),
      status: statusVal,
      position,
      reference_module_id: (position === 'before' || position === 'after') ? parseInt(referenceModuleId, 10) : null
    };

    onInsert(payload);
  };

  const selectedCount = insertionMode === 'repository' 
    ? Object.keys(selectedMaterialsMap).length 
    : (uploadedFilesList.length > 0 ? uploadedFilesList.length : (singleName.trim() ? 1 : 0));

  if (!isVisible) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '12px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting && !uploadingProgress) {
          onClose();
        }
      }}
    >
      <div
        className="modal-container"
        style={{
          backgroundColor: 'var(--bg-card, #ffffff)',
          borderRadius: '12px',
          width: '96vw',
          maxWidth: '1600px',
          height: '95vh',
          maxHeight: '95vh',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
          overflow: 'hidden',
          border: '1px solid var(--border-color, #cbd5e1)',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. FIXED COMPACT HEADER */}
        <div
          className="modal-header"
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg-secondary, #f8fafc)',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>📘</span>
            <div>
              <h2
                className="modal-title"
                style={{
                  margin: 0,
                  fontSize: '16px',
                  fontWeight: '700',
                  color: 'var(--text-main, #0f172a)'
                }}
              >
                Add / Insert Modules in {level?.name || 'Curriculum'}
              </h2>
              <p style={{ margin: '1px 0 0 0', fontSize: '12px', color: 'var(--text-secondary, #64748b)' }}>
                Configure placement and create modules manually, upload local files, or bulk-insert from repository
              </p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={submitting || uploadingProgress}
            aria-label="Close modal"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '22px',
              cursor: submitting ? 'not-allowed' : 'pointer',
              color: 'var(--text-secondary, #64748b)',
              padding: '2px 6px',
              borderRadius: '6px'
            }}
          >
            &times;
          </button>
        </div>

        {/* 2. COMPACT MODE SELECTOR (approx 65-75px height, side-by-side cards) */}
        <div
          style={{
            padding: '10px 20px',
            backgroundColor: '#ffffff',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            flexShrink: 0
          }}
        >
          <div
            role="tablist"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '12px'
            }}
          >
            {/* Card 1: Create New Module */}
            <div
              role="tab"
              aria-selected={insertionMode === 'create'}
              onClick={() => { setInsertionMode('create'); setError(''); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 14px',
                borderRadius: '8px',
                border: insertionMode === 'create' ? '2px solid #4f46e5' : '1px solid #cbd5e1',
                cursor: 'pointer',
                backgroundColor: insertionMode === 'create' ? '#eef2ff' : '#ffffff',
                boxShadow: insertionMode === 'create' ? '0 1px 4px rgba(79, 70, 229, 0.15)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: insertionMode === 'create' ? '#4f46e5' : '#f1f5f9',
                  color: insertionMode === 'create' ? '#ffffff' : '#64748b',
                  flexShrink: 0
                }}
              >
                <Icons.BookOpen className="w-5 h-5" />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: insertionMode === 'create' ? '#312e81' : '#1e293b' }}>
                  Create New Module
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>
                  Manual creation or local computer file upload
                </div>
              </div>
            </div>

            {/* Card 2: Bulk Insert from Repository */}
            <div
              role="tab"
              aria-selected={insertionMode === 'repository'}
              onClick={() => { setInsertionMode('repository'); setError(''); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 14px',
                borderRadius: '8px',
                border: insertionMode === 'repository' ? '2px solid #4f46e5' : '1px solid #cbd5e1',
                cursor: 'pointer',
                backgroundColor: insertionMode === 'repository' ? '#eef2ff' : '#ffffff',
                boxShadow: insertionMode === 'repository' ? '0 1px 4px rgba(79, 70, 229, 0.15)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: insertionMode === 'repository' ? '#4f46e5' : '#f1f5f9',
                  color: insertionMode === 'repository' ? '#ffffff' : '#64748b',
                  flexShrink: 0
                }}
              >
                <Icons.Database className="w-5 h-5" />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: insertionMode === 'repository' ? '#312e81' : '#1e293b' }}>
                    Insert from Repository / Ingestion
                  </span>
                  {Object.keys(selectedMaterialsMap).length > 0 && (
                    <span style={{ backgroundColor: '#4f46e5', color: '#ffffff', fontSize: '10px', padding: '1px 6px', borderRadius: '10px', fontWeight: '700' }}>
                      {Object.keys(selectedMaterialsMap).length}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>
                  Select multiple learning materials already in LMS
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. MAIN INDEPENDENTLY SCROLLABLE CONTENT AREA */}
        <form
          id="insert-module-form"
          onSubmit={handleSubmit}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            backgroundColor: '#ffffff'
          }}
        >
          {error && (
            <div
              className="alert alert-error"
              role="alert"
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#b91c1c',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Icons.AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* COMPACT PLACEMENT & STATUS BAR (Immediately visible below mode selector) */}
          <div
            style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '10px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569' }}>
                  Insertion Position:
                </span>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', cursor: 'pointer', padding: '4px 8px', backgroundColor: position === 'beginning' ? '#eef2ff' : '#ffffff', border: position === 'beginning' ? '1px solid #4f46e5' : '1px solid #cbd5e1', borderRadius: '4px' }}>
                    <input type="radio" name="position" value="beginning" checked={position === 'beginning'} onChange={(e) => setPosition(e.target.value)} />
                    <span style={{ fontWeight: position === 'beginning' ? '700' : '500' }}>At Beginning</span>
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', cursor: 'pointer', padding: '4px 8px', backgroundColor: position === 'end' ? '#eef2ff' : '#ffffff', border: position === 'end' ? '1px solid #4f46e5' : '1px solid #cbd5e1', borderRadius: '4px' }}>
                    <input type="radio" name="position" value="end" checked={position === 'end'} onChange={(e) => setPosition(e.target.value)} />
                    <span style={{ fontWeight: position === 'end' ? '700' : '500' }}>At End</span>
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', cursor: effectiveModules.length > 0 ? 'pointer' : 'not-allowed', padding: '4px 8px', backgroundColor: position === 'before' ? '#eef2ff' : '#ffffff', border: position === 'before' ? '1px solid #4f46e5' : '1px solid #cbd5e1', borderRadius: '4px', opacity: effectiveModules.length > 0 ? 1 : 0.5 }}>
                    <input type="radio" name="position" value="before" checked={position === 'before'} onChange={(e) => setPosition(e.target.value)} disabled={effectiveModules.length === 0} />
                    <span style={{ fontWeight: position === 'before' ? '700' : '500' }}>Before Module</span>
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', cursor: effectiveModules.length > 0 ? 'pointer' : 'not-allowed', padding: '4px 8px', backgroundColor: position === 'after' ? '#eef2ff' : '#ffffff', border: position === 'after' ? '1px solid #4f46e5' : '1px solid #cbd5e1', borderRadius: '4px', opacity: effectiveModules.length > 0 ? 1 : 0.5 }}>
                    <input type="radio" name="position" value="after" checked={position === 'after'} onChange={(e) => setPosition(e.target.value)} disabled={effectiveModules.length === 0} />
                    <span style={{ fontWeight: position === 'after' ? '700' : '500' }}>After Module</span>
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Status:</span>
                <select
                  value={statusVal}
                  onChange={(e) => setStatusVal(e.target.value)}
                  style={{
                    padding: '3px 8px',
                    fontSize: '11px',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff'
                  }}
                >
                  <option value="DRAFT">DRAFT (Authoring)</option>
                  <option value="PUBLISHED">PUBLISHED (Active)</option>
                </select>
              </div>
            </div>

            {(position === 'before' || position === 'after') && effectiveModules.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '4px', borderTop: '1px dashed #e2e8f0' }}>
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#475569' }}>
                  Target Reference Module:
                </span>
                <select
                  className="form-input"
                  value={referenceModuleId}
                  onChange={(e) => setReferenceModuleId(e.target.value)}
                  style={{ maxWidth: '360px', padding: '3px 8px', fontSize: '12px' }}
                >
                  {effectiveModules.map((m) => (
                    <option key={m.id} value={m.id}>Module #{m.order}: {m.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* TAB 1: CREATE NEW MODULE / COMPACT LOCAL FILE UPLOAD */}
          {insertionMode === 'create' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Compact Drag-and-Drop Area (approx 55px height) */}
              <div
                style={{
                  border: '1.5px dashed #cbd5e1',
                  borderRadius: '8px',
                  backgroundColor: '#f8fafc',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease'
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  multiple
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleFilesPicked}
                  accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.png,.jpg,.jpeg,.txt"
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ padding: '6px', borderRadius: '6px', backgroundColor: '#e0e7ff', color: '#4338ca' }}>
                    <Icons.UploadCloud className="w-5 h-5" />
                  </div>
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>
                      Drag &amp; drop or click to upload local learning materials
                    </span>
                    <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '8px' }}>
                      (PDF, Word DOCX, PPTX, Excel, Images) &bull; Creates a module per file
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  style={{
                    padding: '5px 12px',
                    fontSize: '12px',
                    fontWeight: '600',
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    color: '#334155',
                    cursor: 'pointer',
                    pointerEvents: 'none'
                  }}
                >
                  Browse Files
                </button>
              </div>

              {/* Uploaded Files Table */}
              {uploadedFilesList.length > 0 ? (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ padding: '8px 14px', backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#334155' }}>
                      Files to Upload &amp; Insert ({uploadedFilesList.length} Modules)
                    </span>
                    <button
                      type="button"
                      onClick={() => setUploadedFilesList([])}
                      style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '11px', cursor: 'pointer', fontWeight: '600' }}
                    >
                      Clear Uploads
                    </button>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                        <th style={{ padding: '6px 12px', width: '35%' }}>File</th>
                        <th style={{ padding: '6px 12px', width: '45%' }}>Module Name</th>
                        <th style={{ padding: '6px 12px', width: '12%' }}>Est. Min</th>
                        <th style={{ padding: '6px 12px', width: '8%', textAlign: 'center' }}>Remove</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uploadedFilesList.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '6px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Icons.FileText className="w-3.5 h-3.5 text-slate-400" />
                              <span style={{ fontWeight: '600', color: '#1e293b' }}>{item.file.name}</span>
                              <span style={{ fontSize: '10px', color: '#64748b' }}>({Math.round(item.file.size / 1024)} KB)</span>
                            </div>
                          </td>
                          <td style={{ padding: '6px 12px' }}>
                            <input
                              type="text"
                              value={item.moduleName}
                              onChange={(e) => handleUpdateUploadedItemName(idx, e.target.value)}
                              className="form-input"
                              style={{ width: '100%', padding: '4px 8px', fontSize: '12px' }}
                            />
                          </td>
                          <td style={{ padding: '6px 12px' }}>
                            <input
                              type="number"
                              min="0"
                              value={item.duration}
                              onChange={(e) => {
                                const val = e.target.value;
                                setUploadedFilesList(prev => {
                                  const n = [...prev];
                                  n[idx] = { ...n[idx], duration: val };
                                  return n;
                                });
                              }}
                              className="form-input"
                              style={{ width: '60px', padding: '4px 6px', fontSize: '12px' }}
                            />
                          </td>
                          <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleRemoveUploadedItem(idx)}
                              style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}
                            >
                              <Icons.Trash className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* Compact Manual Form Grid (Immediately visible) */
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Module Details (Without Upload)
                  </div>
                  
                  {/* Grid row: Module Name + Duration */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', marginBottom: '3px' }}>
                        Module Name <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        value={singleName}
                        onChange={(e) => setSingleName(e.target.value)}
                        placeholder="e.g. Executive Search & Mapping Strategies"
                        style={{ width: '100%', padding: '6px 10px', fontSize: '13px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', marginBottom: '3px' }}>
                        Duration (Minutes)
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="form-input"
                        placeholder="e.g. 45"
                        value={singleDuration}
                        onChange={(e) => setSingleDuration(e.target.value)}
                        style={{ width: '100%', padding: '6px 10px', fontSize: '13px' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', marginBottom: '3px' }}>
                      Description (Optional)
                    </label>
                    <textarea
                      className="form-input"
                      rows={2}
                      placeholder="Brief summary of learning goals covered in this module..."
                      value={singleDescription}
                      onChange={(e) => setSingleDescription(e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', fontSize: '12px', resize: 'none' }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: BULK INSERT FROM MATERIAL REPOSITORY / INGESTION */}
          {insertionMode === 'repository' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '14px', flex: 1, minHeight: '380px' }}>
              {/* Left Column: Repository Material Browser (Receives majority of content height) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', backgroundColor: '#f8fafc' }}>
                {/* Search, Source Filter & Select Toolbar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', backgroundColor: '#ffffff', padding: '2px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '11px' }}>
                    <button
                      type="button"
                      onClick={() => setMaterialSource('repository')}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '4px',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        backgroundColor: materialSource === 'repository' ? '#e0e7ff' : 'transparent',
                        color: materialSource === 'repository' ? '#4338ca' : '#475569',
                        fontWeight: materialSource === 'repository' ? '700' : '500'
                      }}
                    >
                      <Icons.Database className="w-3.5 h-3.5" />
                      Repository ({trainingFiles.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setMaterialSource('ingestion')}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '4px',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        backgroundColor: materialSource === 'ingestion' ? '#e0e7ff' : 'transparent',
                        color: materialSource === 'ingestion' ? '#4338ca' : '#475569',
                        fontWeight: materialSource === 'ingestion' ? '700' : '500'
                      }}
                    >
                      <Icons.Inbox className="w-3.5 h-3.5" />
                      Ingestion / Staging
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={selectAllFiltered}
                      style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', cursor: 'pointer', fontWeight: '600' }}
                    >
                      Select All ({filteredFiles.length})
                    </button>
                    <button
                      type="button"
                      onClick={clearAllSelected}
                      style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', cursor: 'pointer', color: '#b91c1c' }}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
                    <div style={{ position: 'absolute', left: '8px', top: '7px', color: '#94a3b8' }}>
                      <Icons.Search className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="text"
                      value={materialSearch}
                      onChange={(e) => setMaterialSearch(e.target.value)}
                      placeholder="Search filename or path..."
                      style={{ width: '100%', paddingLeft: '28px', paddingRight: '8px', paddingTop: '5px', paddingBottom: '5px', fontSize: '12px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none' }}
                    />
                  </div>
                  <div>
                    <select
                      value={fileTypeFilter}
                      onChange={(e) => setFileTypeFilter(e.target.value)}
                      style={{ padding: '5px 8px', fontSize: '12px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none' }}
                    >
                      <option value="all">All Formats</option>
                      <option value="pdf">PDF (.pdf)</option>
                      <option value="word">Word (.docx)</option>
                      <option value="presentation">Slides (.pptx)</option>
                      <option value="spreadsheet">Excel (.xlsx)</option>
                    </select>
                  </div>
                </div>

                {/* Material Table Grid */}
                <div style={{ flex: 1, minHeight: '260px', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: '#ffffff', overflowY: 'auto' }}>
                  {loadingMaterials ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <Icons.Spinner className="w-5 h-5 text-indigo-600" />
                      <span style={{ fontSize: '12px' }}>Loading training materials...</span>
                    </div>
                  ) : filteredFiles.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                      No training materials found matching criteria.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', position: 'sticky', top: 0, zIndex: 1 }}>
                          <th style={{ padding: '6px 10px', width: '36px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={filteredFiles.length > 0 && filteredFiles.every(f => !!selectedMaterialsMap[f.id])}
                              onChange={(e) => {
                                if (e.target.checked) selectAllFiltered();
                                else clearAllSelected();
                              }}
                            />
                          </th>
                          <th style={{ padding: '6px 10px' }}>Filename</th>
                          <th style={{ padding: '6px 10px', width: '70px' }}>Format</th>
                          <th style={{ padding: '6px 10px', width: '75px' }}>Size</th>
                          <th style={{ padding: '6px 10px', width: '90px' }}>Mapping</th>
                          <th style={{ padding: '6px 10px', width: '50px', textAlign: 'center' }}>View</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredFiles.map(file => {
                          const isSelected = !!selectedMaterialsMap[file.id];
                          const usage = fileUsageMap[file.id];
                          const count = usage?.count || 0;
                          return (
                            <tr
                              key={file.id}
                              onClick={() => toggleSelectMaterial(file)}
                              style={{
                                borderBottom: '1px solid #f1f5f9',
                                backgroundColor: isSelected ? '#eef2ff' : 'transparent',
                                cursor: 'pointer'
                              }}
                            >
                              <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelectMaterial(file)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </td>
                              <td style={{ padding: '6px 10px' }}>
                                <div style={{ fontWeight: isSelected ? '700' : '500', color: isSelected ? '#312e81' : '#1e293b' }}>
                                  {file.filename || file.name}
                                </div>
                              </td>
                              <td style={{ padding: '6px 10px', color: '#64748b' }}>
                                {file.file_type || 'DOC'}
                              </td>
                              <td style={{ padding: '6px 10px', color: '#64748b' }}>
                                {file.file_size ? `${Math.round(file.file_size / 1024)} KB` : '-'}
                              </td>
                              <td style={{ padding: '6px 10px' }}>
                                {count > 0 ? (
                                  <span style={{ backgroundColor: '#f1f5f9', color: '#475569', padding: '1px 5px', borderRadius: '4px', fontSize: '10px' }}>
                                    Mapped ({count})
                                  </span>
                                ) : (
                                  <span style={{ backgroundColor: '#fef3c7', color: '#b45309', padding: '1px 5px', borderRadius: '4px', fontSize: '10px', fontWeight: '600' }}>
                                    Unmapped
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={(e) => handlePreview(e, file)}
                                  style={{ background: 'transparent', border: 'none', padding: '2px', cursor: 'pointer', color: '#64748b' }}
                                  title="Preview document"
                                >
                                  <Icons.Eye className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Right Column: Selected Materials & Bulk Renaming */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', backgroundColor: '#ffffff' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a' }}>
                    Selected for Insertion ({Object.keys(selectedMaterialsMap).length})
                  </span>
                  {Object.keys(selectedMaterialsMap).length > 0 && (
                    <button
                      type="button"
                      onClick={clearAllSelected}
                      style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '11px', cursor: 'pointer' }}
                    >
                      Deselect All
                    </button>
                  )}
                </div>

                {Object.keys(selectedMaterialsMap).length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '11px' }}>
                    <Icons.Database className="w-6 h-6 text-slate-300" />
                    <p style={{ marginTop: '6px', marginBottom: '2px' }}>No materials selected yet.</p>
                    <p style={{ margin: 0 }}>Check materials on the left to add them to this level.</p>
                  </div>
                ) : (
                  <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '2px' }}>
                    {Object.values(selectedMaterialsMap).map((entry) => (
                      <div
                        key={entry.file.id}
                        style={{
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          padding: '8px',
                          backgroundColor: '#f8fafc',
                          position: 'relative'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                          <span style={{ fontSize: '10px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '270px' }}>
                            {entry.file.filename}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleSelectMaterial(entry.file)}
                            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '12px', lineHeight: 1 }}
                            title="Remove"
                          >
                            &times;
                          </button>
                        </div>
                        <div style={{ marginTop: '4px' }}>
                          <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: '#334155', marginBottom: '2px' }}>
                            Module Name
                          </label>
                          <input
                            type="text"
                            value={entry.moduleName}
                            onChange={(e) => handleUpdateSelectedModuleName(entry.file.id, e.target.value)}
                            className="form-input"
                            style={{ width: '100%', padding: '4px 6px', fontSize: '11px' }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </form>

        {/* 4. FIXED FOOTER */}
        <div
          className="modal-footer"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            borderTop: '1px solid var(--border-color, #e2e8f0)',
            backgroundColor: 'var(--bg-secondary, #f8fafc)',
            flexShrink: 0
          }}
        >
          <div style={{ fontSize: '12px', color: '#475569', fontWeight: '600' }}>
            {selectedCount > 0 ? (
              <span style={{ color: '#4338ca' }}>
                ⭐ {selectedCount} {selectedCount === 1 ? 'Module' : 'Modules'} will be created at position ({position})
              </span>
            ) : (
              <span>No modules configured yet</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={submitting || uploadingProgress}
              style={{ padding: '6px 14px', fontSize: '12px' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="insert-module-form"
              className="btn btn-primary"
              disabled={submitting || uploadingProgress || selectedCount === 0}
              style={{
                padding: '6px 18px',
                fontSize: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: '700'
              }}
            >
              {submitting || uploadingProgress ? (
                <>
                  <Icons.Spinner className="w-3.5 h-3.5" />
                  {uploadingProgress ? 'Uploading Files...' : 'Inserting Modules...'}
                </>
              ) : (
                selectedCount > 1 ? `Insert ${selectedCount} Modules` : 'Insert Module'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
