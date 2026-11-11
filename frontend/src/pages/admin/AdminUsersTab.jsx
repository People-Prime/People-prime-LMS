import { useEffect, useState, useCallback, useMemo } from "react";
import { apiClient } from "../../services/api";

export default function AdminUsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Add User Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    username: "",
    role: "LEARNER",
    password: "",
    isActive: true,
  });
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);

  // Status Action (deactivate / activate)
  const [actionUserId, setActionUserId] = useState(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient("/admin/users/");
      const list = Array.isArray(data) ? data : (data?.results || []);
      setUsers(list);
    } catch (err) {
      setError(err.message || "Failed to load users from the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        setLoading(true);
        setError(null);
        const data = await apiClient("/admin/users/");
        if (isMounted) {
          const list = Array.isArray(data) ? data : (data?.results || []);
          setUsers(list);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || "Failed to load users from the server.");
          setLoading(false);
        }
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, []);

  // Client-side search and filtering for ultra-fast, responsive TalentLMS feel
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Role filter
      if (roleFilter !== "ALL" && u.role !== roleFilter) {
        return false;
      }
      // Status filter
      if (statusFilter === "ACTIVE" && !u.is_active) {
        return false;
      }
      if (statusFilter === "INACTIVE" && u.is_active) {
        return false;
      }
      // Search query (name, email, username)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const fullName = (u.name || "").toLowerCase();
        const email = (u.email || "").toLowerCase();
        const username = (u.username || "").toLowerCase();
        if (!fullName.includes(q) && !email.includes(q) && !username.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [users, roleFilter, statusFilter, searchQuery]);

  // Paginated records
  const totalPages = Math.ceil(filteredUsers.length / pageSize) || 1;
  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredUsers.slice(startIndex, startIndex + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  const handleRoleFilterChange = (e) => {
    setRoleFilter(e.target.value);
    setCurrentPage(1);
  };

  const handleStatusFilterChange = (e) => {
    setStatusFilter(e.target.value);
    setCurrentPage(1);
  };

  const handleOpenAddModal = () => {
    setFormData({
      firstName: "",
      lastName: "",
      email: "",
      username: "",
      role: "LEARNER",
      password: "",
      isActive: true,
    });
    setModalError(null);
    setShowAddModal(true);
  };

  const handleCloseAddModal = () => {
    if (!modalSubmitting) {
      setShowAddModal(false);
      setModalError(null);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setModalError(null);

    // Validation
    if (!formData.email.trim()) {
      setModalError("Email address is required.");
      return;
    }
    if (!formData.password) {
      setModalError("Password is required.");
      return;
    }

    setModalSubmitting(true);
    try {
      const payload = {
        first_name: formData.firstName.trim(),
        last_name: formData.lastName.trim(),
        email: formData.email.trim(),
        username: formData.username.trim() || formData.email.trim(),
        role: formData.role,
        password: formData.password,
        is_active: formData.isActive,
      };

      const res = await apiClient("/admin/users/", {
        method: "POST",
        body: payload,
      });

      setSuccessMessage(`User "${res.name || res.username}" created successfully.`);
      setShowAddModal(false);
      fetchUsers();
    } catch (err) {
      setModalError(err.message || "Failed to create user. Please check the information.");
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleToggleStatus = async (user) => {
    const action = user.is_active ? "deactivate" : "activate";
    const confirmMsg = user.is_active
      ? `Are you sure you want to deactivate ${user.name || user.username}? They will no longer be able to log in.`
      : `Are you sure you want to activate ${user.name || user.username}?`;

    if (!window.confirm(confirmMsg)) return;

    setActionUserId(user.id);
    setError(null);
    setSuccessMessage("");
    try {
      await apiClient(`/admin/users/${user.id}/${action}/`, {
        method: "POST",
      });
      setSuccessMessage(`User "${user.name || user.username}" ${action}d successfully.`);
      fetchUsers();
    } catch (err) {
      setError(err.message || `Failed to ${action} user.`);
    } finally {
      setActionUserId(null);
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return "-";
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return "-";
      return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "-";
    }
  };

  return (
    <div className="users-page-container">
      {/* Top Banner & Action */}
      <div className="users-header-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 style={{ fontSize: "20px", fontWeight: "700", color: "var(--text-main)", margin: 0 }}>Users</h2>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px", margin: 0 }}>
            Manage learners, trainers, and administrators across the LMS.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={handleOpenAddModal}
          style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 18px", fontSize: "14px", fontWeight: "600" }}
        >
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          Add user
        </button>
      </div>

      {/* Alerts */}
      {successMessage && (
        <div className="alert alert-success" style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{successMessage}</span>
          <button
            type="button"
            onClick={() => setSuccessMessage("")}
            style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontSize: "16px" }}
          >
            ×
          </button>
        </div>
      )}

      {error && (
        <div className="alert alert-error" style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontSize: "16px" }}
          >
            ×
          </button>
        </div>
      )}

      {/* Search and Filters Bar (TalentLMS Style) */}
      <div className="card" style={{ padding: "16px 20px", marginBottom: "20px" }}>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          {/* Search Box */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: "1 1 280px", maxWidth: "400px" }}>
            <div style={{ position: "relative", width: "100%" }}>
              <svg
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                className="form-input"
                placeholder="Search by name, email or username..."
                value={searchQuery}
                onChange={handleSearchChange}
                style={{ paddingLeft: "36px", width: "100%", fontSize: "13px" }}
              />
            </div>
            {searchQuery && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setSearchQuery("");
                  setCurrentPage(1);
                }}
                style={{ padding: "8px 12px", fontSize: "12px" }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Filters (User Type, Status) */}
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <label htmlFor="user-type-filter" style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: "500" }}>Type:</label>
              <select
                id="user-type-filter"
                className="form-input"
                value={roleFilter}
                onChange={handleRoleFilterChange}
                style={{ width: "auto", minWidth: "120px", fontSize: "13px", padding: "6px 12px" }}
              >
                <option value="ALL">All types</option>
                <option value="ADMIN">Admin</option>
                <option value="TRAINER">Trainer</option>
                <option value="LEARNER">Learner</option>
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <label htmlFor="user-status-filter" style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: "500" }}>Status:</label>
              <select
                id="user-status-filter"
                className="form-input"
                value={statusFilter}
                onChange={handleStatusFilterChange}
                style={{ width: "auto", minWidth: "120px", fontSize: "13px", padding: "6px 12px" }}
              >
                <option value="ALL">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={fetchUsers}
              disabled={loading}
              title="Refresh users list"
              style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: "6px" }}
            >
              <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="card" style={{ padding: "0", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "60px 20px", textAlign: "center" }}>
            <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
            <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Loading users...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div style={{ padding: "60px 20px", textAlign: "center" }}>
            <svg width="40" height="40" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ margin: "0 auto 12px", color: "var(--text-muted)" }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h4 style={{ color: "var(--text-main)", fontSize: "15px", marginBottom: "4px" }}>No users found</h4>
            <p style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
              {searchQuery || roleFilter !== "ALL" || statusFilter !== "ALL"
                ? "Try adjusting your search criteria or clearing filters."
                : "No users currently exist in the database."}
            </p>
          </div>
        ) : (
          <div className="table-responsive" style={{ overflowX: "auto" }}>
            <table className="table" style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-color)", background: "rgba(255,255,255,0.02)" }}>
                  <th style={{ padding: "14px 20px", fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>
                    User
                  </th>
                  <th style={{ padding: "14px 16px", fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>
                    Email
                  </th>
                  <th style={{ padding: "14px 16px", fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>
                    Type
                  </th>
                  <th style={{ padding: "14px 16px", fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>
                    Registration
                  </th>
                  <th style={{ padding: "14px 16px", fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>
                    Last login
                  </th>
                  <th style={{ padding: "14px 16px", fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>
                    Status
                  </th>
                  <th style={{ padding: "14px 20px", fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", textAlign: "right" }}>
                    Options
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedUsers.map((u) => (
                  <tr
                    key={u.id}
                    style={{
                      borderBottom: "1px solid var(--border-color)",
                      transition: "background-color 0.15s ease",
                    }}
                  >
                    {/* User (Full name with initial avatar badge) */}
                    <td style={{ padding: "14px 20px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div
                          style={{
                            width: "34px",
                            height: "34px",
                            borderRadius: "50%",
                            background: u.role === "ADMIN" ? "rgba(99, 102, 241, 0.2)" : u.role === "TRAINER" ? "rgba(56, 189, 248, 0.2)" : "rgba(34, 197, 94, 0.2)",
                            color: u.role === "ADMIN" ? "#818cf8" : u.role === "TRAINER" ? "#38bdf8" : "#4ade80",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "13px",
                            fontWeight: "700",
                            flexShrink: 0,
                          }}
                        >
                          {(u.name || u.username)[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: "600", fontSize: "14px", color: "var(--text-main)" }}>
                            {u.name || u.username}
                          </div>
                          {u.name && u.username !== u.name && (
                            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                              @{u.username}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Email */}
                    <td style={{ padding: "14px 16px", fontSize: "13px", color: "var(--text-secondary)" }}>
                      {u.email || "-"}
                    </td>

                    {/* Type */}
                    <td style={{ padding: "14px 16px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "3px 10px",
                          borderRadius: "12px",
                          fontSize: "12px",
                          fontWeight: "600",
                          background:
                            u.role === "ADMIN"
                              ? "rgba(99, 102, 241, 0.15)"
                              : u.role === "TRAINER"
                              ? "rgba(56, 189, 248, 0.15)"
                              : "rgba(148, 163, 184, 0.15)",
                          color:
                            u.role === "ADMIN"
                              ? "#818cf8"
                              : u.role === "TRAINER"
                              ? "#38bdf8"
                              : "#94a3b8",
                        }}
                      >
                        {u.user_type_label || (u.role === "ADMIN" ? "Admin" : u.role === "TRAINER" ? "Trainer" : "Learner")}
                      </span>
                    </td>

                    {/* Registration */}
                    <td style={{ padding: "14px 16px", fontSize: "13px", color: "var(--text-secondary)" }}>
                      {formatDate(u.date_joined)}
                    </td>

                    {/* Last login */}
                    <td style={{ padding: "14px 16px", fontSize: "13px", color: "var(--text-secondary)" }}>
                      {formatDate(u.last_login)}
                    </td>

                    {/* Status */}
                    <td style={{ padding: "14px 16px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "3px 10px",
                          borderRadius: "12px",
                          fontSize: "12px",
                          fontWeight: "600",
                          background: u.is_active ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
                          color: u.is_active ? "var(--status-success)" : "var(--status-error)",
                        }}
                      >
                        <span
                          style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            background: u.is_active ? "var(--status-success)" : "var(--status-error)",
                          }}
                        />
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>

                    {/* Options (Activate / Deactivate) */}
                    <td style={{ padding: "14px 20px", textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(u)}
                        disabled={actionUserId === u.id}
                        className={u.is_active ? "btn btn-secondary" : "btn btn-primary"}
                        style={{
                          padding: "5px 12px",
                          fontSize: "12px",
                          fontWeight: "500",
                          borderRadius: "var(--radius-sm)",
                        }}
                      >
                        {actionUserId === u.id
                          ? "Updating..."
                          : u.is_active
                          ? "Deactivate"
                          : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {!loading && filteredUsers.length > 0 && (
          <div
            style={{
              padding: "14px 20px",
              borderTop: "1px solid var(--border-color)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              Showing {filteredUsers.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} to{" "}
              {Math.min(currentPage * pageSize, filteredUsers.length)} of {filteredUsers.length} users
            </div>

            {totalPages > 1 && (
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  style={{ padding: "4px 10px", fontSize: "12px" }}
                >
                  Previous
                </button>
                <span style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "0 4px" }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  style={{ padding: "4px 10px", fontSize: "12px" }}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add User Modal (TalentLMS style) */}
      {showAddModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: "520px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "var(--shadow-lg)",
              padding: "24px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ fontSize: "18px", fontWeight: "700", color: "var(--text-main)", margin: 0 }}>Add user</h3>
              <button
                type="button"
                onClick={handleCloseAddModal}
                disabled={modalSubmitting}
                style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "20px" }}
              >
                ×
              </button>
            </div>

            {modalError && (
              <div className="alert alert-error" style={{ marginBottom: "16px", fontSize: "13px" }}>
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateUser}>
              {/* Personal Information */}
              <div style={{ marginBottom: "16px" }}>
                <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Personal Information
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                <div>
                  <label htmlFor="modal-first-name" style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "4px" }}>
                    First name
                  </label>
                  <input
                    id="modal-first-name"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Jane"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="modal-last-name" style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "4px" }}>
                    Last name
                  </label>
                  <input
                    id="modal-last-name"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Doe"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label htmlFor="modal-email" style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "4px" }}>
                  Email address <span style={{ color: "var(--status-error)" }}>*</span>
                </label>
                <input
                  id="modal-email"
                  type="email"
                  required
                  className="form-input"
                  placeholder="e.g. jane.doe@gmail.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
                <span style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginTop: "3px" }}>
                  Standard corporate and Gmail addresses are accepted.
                </span>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label htmlFor="modal-username" style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "4px" }}>
                  Username (optional)
                </label>
                <input
                  id="modal-username"
                  type="text"
                  className="form-input"
                  placeholder="Leave empty to use email as username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                />
              </div>

              {/* Account Information */}
              <div style={{ marginBottom: "16px", paddingTop: "8px", borderTop: "1px solid var(--border-color)" }}>
                <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Account Information
                </span>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label htmlFor="modal-role" style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "4px" }}>
                  User type <span style={{ color: "var(--status-error)" }}>*</span>
                </label>
                <select
                  id="modal-role"
                  className="form-input"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                >
                  <option value="LEARNER">Learner</option>
                  <option value="TRAINER">Trainer</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label htmlFor="modal-password" style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "4px" }}>
                  Password <span style={{ color: "var(--status-error)" }}>*</span>
                </label>
                <input
                  id="modal-password"
                  type="password"
                  required
                  className="form-input"
                  placeholder="Set initial account password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
                <span style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginTop: "3px" }}>
                  Minimum 8 characters. Direct password setup (email delivery server is currently unconfigured).
                </span>
              </div>

              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px", color: "var(--text-main)" }}>
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    style={{ cursor: "pointer" }}
                  />
                  Active account (user can log in immediately)
                </label>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCloseAddModal}
                  disabled={modalSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={modalSubmitting}
                >
                  {modalSubmitting ? "Creating user..." : "Add user"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

