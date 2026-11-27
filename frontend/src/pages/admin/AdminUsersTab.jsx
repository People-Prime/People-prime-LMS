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

  // Delete User Confirmation Modal
  const [userToDelete, setUserToDelete] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // Edit User Modal
  const [userToEdit, setUserToEdit] = useState(null);
  const [editFormData, setEditFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    username: "",
    role: "LEARNER",
    isActive: true,
  });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState(null);

  // Reset Password Modal
  const [userToResetPassword, setUserToResetPassword] = useState(null);
  const [resetFormData, setResetFormData] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState(null);

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
    const cleanEmail = formData.email.trim();
    if (!cleanEmail) {
      setModalError("Email address is required.");
      return;
    }
    if (!cleanEmail.toLowerCase().endsWith("@people-prime.com")) {
      setModalError("Only corporate @people-prime.com email addresses are permitted.");
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
        email: cleanEmail,
        username: formData.username.trim() || cleanEmail,
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

  const handleOpenDeleteModal = (user) => {
    setUserToDelete(user);
    setDeleteError(null);
  };

  const handleCloseDeleteModal = () => {
    if (!deleteSubmitting) {
      setUserToDelete(null);
      setDeleteError(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      const res = await apiClient(`/admin/users/${userToDelete.id}/`, {
        method: "DELETE",
      });
      setSuccessMessage(res?.message || `User "${userToDelete.name || userToDelete.username}" was permanently deleted.`);
      setUserToDelete(null);
      fetchUsers();
    } catch (err) {
      setDeleteError(err.message || "Failed to delete user. Please resolve any conflicts and try again.");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // Edit User Handlers
  const handleOpenEditModal = (user) => {
    setUserToEdit(user);
    setEditFormData({
      firstName: user.first_name || "",
      lastName: user.last_name || "",
      email: user.email || "",
      username: user.username || "",
      role: user.role || "LEARNER",
      isActive: Boolean(user.is_active),
    });
    setEditError(null);
  };

  const handleCloseEditModal = () => {
    if (!editSubmitting) {
      setUserToEdit(null);
      setEditError(null);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!userToEdit) return;
    setEditError(null);

    const cleanEmail = editFormData.email.trim().toLowerCase();
    if (!cleanEmail) {
      setEditError("Corporate email address is required.");
      return;
    }
    if (!cleanEmail.endsWith("@people-prime.com")) {
      setEditError("Only corporate @people-prime.com email addresses are permitted.");
      return;
    }
    const cleanUsername = editFormData.username.trim();
    if (!cleanUsername) {
      setEditError("Username cannot be blank.");
      return;
    }

    setEditSubmitting(true);
    try {
      const payload = {
        first_name: editFormData.firstName.trim(),
        last_name: editFormData.lastName.trim(),
        email: cleanEmail,
        username: cleanUsername,
        role: editFormData.role,
        is_active: editFormData.isActive,
      };

      await apiClient(`/admin/users/${userToEdit.id}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      setSuccessMessage(`User "${cleanUsername}" was updated successfully.`);
      setUserToEdit(null);
      fetchUsers();
    } catch (err) {
      setEditError(err.message || "Failed to update user profile. Please check the information.");
    } finally {
      setEditSubmitting(false);
    }
  };

  // Reset Password Handlers
  const handleOpenResetModal = (user) => {
    setUserToResetPassword(user);
    setResetFormData({
      newPassword: "",
      confirmPassword: "",
    });
    setResetError(null);
  };

  const handleCloseResetModal = () => {
    if (!resetSubmitting) {
      setUserToResetPassword(null);
      setResetError(null);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    if (!userToResetPassword) return;
    setResetError(null);

    if (!resetFormData.newPassword) {
      setResetError("New password is required.");
      return;
    }
    if (resetFormData.newPassword !== resetFormData.confirmPassword) {
      setResetError("Passwords do not match.");
      return;
    }

    setResetSubmitting(true);
    try {
      const payload = {
        new_password: resetFormData.newPassword,
        confirm_password: resetFormData.confirmPassword,
      };

      const res = await apiClient(`/admin/users/${userToResetPassword.id}/reset-password/`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setSuccessMessage(res?.message || `Password for @${userToResetPassword.username} has been reset successfully.`);
      setUserToResetPassword(null);
    } catch (err) {
      setResetError(err.message || "Failed to reset password. Please verify the password requirements.");
    } finally {
      setResetSubmitting(false);
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

                    {/* Options (Edit, Reset Password, Activate/Deactivate, Delete) */}
                    <td style={{ padding: "14px 20px", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(u)}
                          disabled={actionUserId === u.id || deleteSubmitting || editSubmitting}
                          title="Edit user profile"
                          className="btn btn-secondary"
                          style={{
                            padding: "5px 10px",
                            fontSize: "12px",
                            fontWeight: "500",
                            borderRadius: "var(--radius-sm)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenResetModal(u)}
                          disabled={actionUserId === u.id || deleteSubmitting || resetSubmitting}
                          title="Reset password"
                          className="btn btn-secondary"
                          style={{
                            padding: "5px 10px",
                            fontSize: "12px",
                            fontWeight: "500",
                            borderRadius: "var(--radius-sm)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                          </svg>
                          Reset Password
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleStatus(u)}
                          disabled={actionUserId === u.id || deleteSubmitting}
                          className={u.is_active ? "btn btn-secondary" : "btn btn-primary"}
                          style={{
                            padding: "5px 10px",
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

                        <button
                          type="button"
                          onClick={() => handleOpenDeleteModal(u)}
                          disabled={actionUserId === u.id || deleteSubmitting}
                          title="Permanently delete user"
                          style={{
                            padding: "5px 10px",
                            fontSize: "12px",
                            fontWeight: "500",
                            borderRadius: "var(--radius-sm)",
                            background: "rgba(239, 68, 68, 0.1)",
                            color: "var(--status-error)",
                            border: "1px solid rgba(239, 68, 68, 0.2)",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete
                        </button>
                      </div>
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
                  Corporate email address <span style={{ color: "var(--status-error)" }}>*</span>
                </label>
                <input
                  id="modal-email"
                  type="email"
                  required
                  className="form-input"
                  placeholder="user@people-prime.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
                <span style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginTop: "3px" }}>
                  Must be an official @people-prime.com company address. External domains (including Gmail) are rejected.
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
      {/* Delete User Confirmation Modal */}
      {userToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(3px)",
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
              width: "100%",
              maxWidth: "500px",
              padding: "24px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              border: "1px solid var(--border-color)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: "16px", marginBottom: "16px" }}>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  background: "rgba(239, 68, 68, 0.15)",
                  color: "var(--status-error)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>

              <div style={{ flex: 1 }}>
                <h3 id="delete-modal-title" style={{ fontSize: "18px", fontWeight: "700", color: "var(--text-main)", margin: "0 0 4px 0" }}>
                  Permanently Delete User?
                </h3>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0, lineHeight: "1.5" }}>
                  This will physically delete the user account from the system.
                </p>
              </div>
            </div>

            {deleteError && (
              <div className="alert alert-error" style={{ marginBottom: "16px" }}>
                <span>{deleteError}</span>
              </div>
            )}

            {/* User Details Summary Card */}
            <div
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-md)",
                padding: "14px 16px",
                marginBottom: "16px",
                fontSize: "13px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ color: "var(--text-muted)" }}>Full name:</span>
                <span style={{ fontWeight: "600", color: "var(--text-main)" }}>
                  {userToDelete.name || userToDelete.username}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ color: "var(--text-muted)" }}>Email address:</span>
                <span style={{ color: "var(--text-main)" }}>{userToDelete.email || "-"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ color: "var(--text-muted)" }}>Username:</span>
                <span style={{ color: "var(--text-main)" }}>@{userToDelete.username}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Role:</span>
                <span style={{ fontWeight: "600", color: "var(--primary-color)" }}>
                  {userToDelete.user_type_label || userToDelete.role}
                </span>
              </div>
            </div>

            {/* Explicit Warning Callout */}
            <div
              style={{
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                borderRadius: "var(--radius-md)",
                padding: "12px 14px",
                marginBottom: "20px",
                fontSize: "13px",
                color: "var(--status-error)",
                lineHeight: "1.4",
              }}
            >
              <strong>Warning:</strong> Are you sure you want to permanently delete this user? Their account and associated learner records may be permanently removed. This action cannot be undone.
            </div>

            {/* Modal Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCloseDeleteModal}
                disabled={deleteSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                onClick={handleConfirmDelete}
                disabled={deleteSubmitting}
                style={{
                  background: "var(--status-error)",
                  color: "#ffffff",
                  border: "none",
                  fontWeight: "600",
                  padding: "8px 18px",
                }}
              >
                {deleteSubmitting ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {userToEdit && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
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
              width: "100%",
              maxWidth: "520px",
              background: "var(--bg-surface)",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3)",
              border: "1px solid var(--border-color)",
              padding: "24px",
              borderRadius: "var(--radius-lg)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ fontSize: "18px", fontWeight: "700", color: "var(--text-main)", margin: 0 }}>
                Edit User Profile
              </h3>
              <button
                type="button"
                onClick={handleCloseEditModal}
                disabled={editSubmitting}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  padding: "4px",
                }}
              >
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {editError && (
              <div
                style={{
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  color: "var(--status-error)",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-md)",
                  fontSize: "13px",
                  marginBottom: "16px",
                }}
              >
                {editError}
              </div>
            )}

            <form onSubmit={handleEditSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                <div>
                  <label htmlFor="edit-first-name" style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "4px" }}>
                    First name
                  </label>
                  <input
                    id="edit-first-name"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Jane"
                    value={editFormData.firstName}
                    onChange={(e) => setEditFormData({ ...editFormData, firstName: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="edit-last-name" style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "4px" }}>
                    Last name
                  </label>
                  <input
                    id="edit-last-name"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Doe"
                    value={editFormData.lastName}
                    onChange={(e) => setEditFormData({ ...editFormData, lastName: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label htmlFor="edit-email" style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "4px" }}>
                  Corporate email address <span style={{ color: "var(--status-error)" }}>*</span>
                </label>
                <input
                  id="edit-email"
                  type="email"
                  required
                  className="form-input"
                  placeholder="user@people-prime.com"
                  value={editFormData.email}
                  onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                />
                <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginTop: "3px" }}>
                  Must be an official @people-prime.com corporate email address.
                </span>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label htmlFor="edit-username" style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "4px" }}>
                  Username <span style={{ color: "var(--status-error)" }}>*</span>
                </label>
                <input
                  id="edit-username"
                  type="text"
                  required
                  className="form-input"
                  value={editFormData.username}
                  onChange={(e) => setEditFormData({ ...editFormData, username: e.target.value })}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
                <div>
                  <label htmlFor="edit-role" style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "4px" }}>
                    User type <span style={{ color: "var(--status-error)" }}>*</span>
                  </label>
                  <select
                    id="edit-role"
                    className="form-input"
                    value={editFormData.role}
                    onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                  >
                    <option value="LEARNER">Learner</option>
                    <option value="TRAINER">Trainer</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="edit-status" style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "4px" }}>
                    Account status
                  </label>
                  <select
                    id="edit-status"
                    className="form-input"
                    value={editFormData.isActive ? "ACTIVE" : "INACTIVE"}
                    onChange={(e) => setEditFormData({ ...editFormData, isActive: e.target.value === "ACTIVE" })}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCloseEditModal}
                  disabled={editSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={editSubmitting}
                >
                  {editSubmitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {userToResetPassword && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
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
              width: "100%",
              maxWidth: "460px",
              background: "var(--bg-surface)",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3)",
              border: "1px solid var(--border-color)",
              padding: "24px",
              borderRadius: "var(--radius-lg)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <h3 style={{ fontSize: "18px", fontWeight: "700", color: "var(--text-main)", margin: "0 0 4px 0" }}>
                  Reset User Password
                </h3>
                <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                  Resetting credentials for @{userToResetPassword.username}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCloseResetModal}
                disabled={resetSubmitting}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  padding: "4px",
                }}
              >
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {resetError && (
              <div
                style={{
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  color: "var(--status-error)",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-md)",
                  fontSize: "13px",
                  marginBottom: "16px",
                }}
              >
                {resetError}
              </div>
            )}

            <form onSubmit={handleResetSubmit}>
              <div style={{ marginBottom: "14px" }}>
                <label htmlFor="reset-new-password" style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "4px" }}>
                  New Password <span style={{ color: "var(--status-error)" }}>*</span>
                </label>
                <input
                  id="reset-new-password"
                  type="password"
                  required
                  className="form-input"
                  placeholder="Enter new password"
                  value={resetFormData.newPassword}
                  onChange={(e) => setResetFormData({ ...resetFormData, newPassword: e.target.value })}
                />
              </div>

              <div style={{ marginBottom: "20px" }}>
                <label htmlFor="reset-confirm-password" style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "4px" }}>
                  Confirm New Password <span style={{ color: "var(--status-error)" }}>*</span>
                </label>
                <input
                  id="reset-confirm-password"
                  type="password"
                  required
                  className="form-input"
                  placeholder="Re-enter new password"
                  value={resetFormData.confirmPassword}
                  onChange={(e) => setResetFormData({ ...resetFormData, confirmPassword: e.target.value })}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCloseResetModal}
                  disabled={resetSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={resetSubmitting}
                >
                  {resetSubmitting ? "Resetting..." : "Reset Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

