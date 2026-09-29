import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import { toast } from "../utils/toast";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "https://vivah-2rc8.onrender.com";

const PERMISSION_FIELDS = [
  { key: "daily_interests", label: "Daily Interests Limit", type: "number" },
  { key: "daily_recommendations", label: "Daily Recommendations", type: "number" },
  { key: "max_photos", label: "Max Photos", type: "number" },
  { key: "advanced_search", label: "Advanced Search Access", type: "bool" },
  { key: "see_visitors", label: "See Who Viewed Me", type: "bool" },
  { key: "unlimited_chat", label: "Unlimited Chat", type: "bool" },
  { key: "profile_boost", label: "Profile Boost Included", type: "bool" },
  { key: "contact_access", label: "View Contact Info", type: "bool" },
  { key: "priority_support", label: "Priority Support", type: "bool" },
  { key: "see_dob", label: "See Date of Birth", type: "bool" },
  { key: "see_horoscope", label: "See Horoscope Details", type: "bool" },
  { key: "see_income", label: "See Income Details", type: "bool" },
  { key: "interest_to_anyone", label: "Send Interest to Any Community", type: "bool" },
  { key: "see_full_photo", label: "See Full Photos (No Blur)", type: "bool" },
  { key: "request_photo", label: "Can Request to View Photos", type: "bool" },
  { key: "can_view_paid_profiles", label: "Can View Paid Member Profiles", type: "bool" },
];

const DEFAULT_PERMISSIONS = {
  daily_interests: 5,
  daily_recommendations: 5,
  max_photos: 3,
  advanced_search: false,
  see_visitors: false,
  unlimited_chat: false,
  profile_boost: false,
  contact_access: false,
  priority_support: false,
  see_dob: false,
  see_horoscope: false,
  see_income: false,
  interest_to_anyone: false,
  see_full_photo: false,
  request_photo: true,
  can_view_paid_profiles: false,
};

function AdminPlans() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900);
  const [editingPlan, setEditingPlan] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const [newPlan, setNewPlan] = useState({
    name: "",
    price: 0,
    duration_days: 30,
    permissions: { ...DEFAULT_PERMISSIONS },
    display_order: 0,
  });

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/login"); return; }

      const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
      if (!profile || profile.role !== "admin") { navigate("/dashboard"); return; }

      try {
        const res = await fetch(`${BACKEND_URL}/plans/admin/all`);
        if (res.ok) {
          const data = await res.json();
          setPlans(data.plans || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [navigate]);

  const reload = async () => {
    const res = await fetch(`${BACKEND_URL}/plans/admin/all`);
    if (res.ok) {
      const data = await res.json();
      setPlans(data.plans || []);
    }
  };

  const handleCreate = async () => {
    if (!newPlan.name.trim()) return toast.error("Plan name is required");
    setSaving(true);
    try {
      const res = await fetch(`${BACKEND_URL}/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newPlan,
          features: Object.entries(newPlan.permissions)
            .filter(([_, v]) => v === true)
            .map(([k]) => k),
        }),
      });
      if (res.ok) {
        toast.success("Plan created!");
        setShowCreate(false);
        setNewPlan({ name: "", price: 0, duration_days: 30, permissions: { ...DEFAULT_PERMISSIONS }, display_order: 0 });
        await reload();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to create plan");
      }
    } catch { toast.error("Network error"); } finally { setSaving(false); }
  };

  const handleUpdate = async () => {
    if (!editingPlan) return;
    setSaving(true);
    try {
      const res = await fetch(`${BACKEND_URL}/plans/${editingPlan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingPlan.name,
          price: editingPlan.price,
          duration_days: editingPlan.duration_days,
          permissions: editingPlan.permissions,
          is_active: editingPlan.is_active,
          display_order: editingPlan.display_order,
        }),
      });
      if (res.ok) {
        toast.success("Plan updated!");
        setEditingPlan(null);
        await reload();
      } else {
        toast.error("Update failed");
      }
    } catch { toast.error("Network error"); } finally { setSaving(false); }
  };

  const handleDelete = async (plan) => {
    if (plan.name === "Free") return toast.error("Free plan cannot be deleted");
    if (!window.confirm(`Delete plan "${plan.name}"?`)) return;
    try {
      const res = await fetch(`${BACKEND_URL}/plans/${plan.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Plan deleted");
        await reload();
      }
    } catch { toast.error("Delete failed"); }
  };

  const togglePermission = (permKey) => {
    setEditingPlan(prev => ({
      ...prev,
      permissions: { ...prev.permissions, [permKey]: !prev.permissions[permKey] },
    }));
  };

  const updatePermissionValue = (permKey, value) => {
    setEditingPlan(prev => ({
      ...prev,
      permissions: { ...prev.permissions, [permKey]: value },
    }));
  };

  const toggleNewPermission = (permKey) => {
    setNewPlan(prev => ({
      ...prev,
      permissions: { ...prev.permissions, [permKey]: !prev.permissions[permKey] },
    }));
  };

  const updateNewPermissionValue = (permKey, value) => {
    setNewPlan(prev => ({
      ...prev,
      permissions: { ...prev.permissions, [permKey]: value },
    }));
  };

  if (loading) return <div style={{ padding: 60, textAlign: "center" }}>Loading...</div>;

  const S = {
    page: { maxWidth: "1100px", margin: "0 auto", padding: isMobile ? "16px" : "32px" },
    header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: 12 },
    h1: { fontFamily: "'Playfair Display', serif", fontSize: isMobile ? "22px" : "28px", color: "#8B0A2E", marginBottom: "4px" },
    sub: { color: "#8a6b6b", fontSize: "13px", margin: 0 },
    btn: { background: "#8B0A2E", color: "white", border: "none", padding: "12px 20px", borderRadius: "10px", fontWeight: 700, cursor: "pointer", fontSize: "14px", fontFamily: "inherit" },
    backBtn: { background: "#e5e7eb", color: "#8B0A2E", padding: "10px 18px", borderRadius: 8, textDecoration: "none", fontWeight: "bold", fontSize: 14 },
    card: { background: "white", borderRadius: "14px", padding: "20px", border: "1px solid #f0e0e0", marginBottom: "16px" },
    label: { display: "block", fontSize: "11px", fontWeight: 700, color: "#555", marginBottom: "6px", textTransform: "uppercase" },
    input: { width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "14px", fontFamily: "inherit", outline: "none", background: "#FFF9F5", boxSizing: "border-box" },
    permsGrid: { display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: "10px", marginTop: "12px" },
    permRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#FFF9F5", borderRadius: "8px", border: "1px solid #f0e0e0" },
    permLabel: { fontSize: "13px", color: "#2D1B1B", fontWeight: 600 },
    planCard: { background: "white", borderRadius: "14px", padding: "20px", border: "1px solid #f0e0e0", marginBottom: "12px" },
    planHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", flexWrap: "wrap", gap: 12 },
    planName: { fontFamily: "'Playfair Display', serif", fontSize: "20px", fontWeight: 700, color: "#8B0A2E", marginBottom: "4px" },
    planPrice: { fontSize: "14px", color: "#8a6b6b" },
    planBtns: { display: "flex", gap: 8, flexWrap: "wrap" },
    smallBtn: { border: "none", padding: "8px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  };

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <h1 style={S.h1}>💎 Membership Plans</h1>
          <p style={S.sub}>Create, edit, and control plan features & permissions</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setShowCreate(!showCreate)} style={S.btn}>
            {showCreate ? "✕ Cancel" : "➕ Create Plan"}
          </button>
          <Link to="/admin" style={S.backBtn}>← Dashboard</Link>
        </div>
      </div>

      {showCreate && (
        <div style={S.card}>
          <h3 style={{ color: "#8B0A2E", marginTop: 0, marginBottom: "16px" }}>➕ New Plan</h3>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div><label style={S.label}>Plan Name</label><input style={S.input} value={newPlan.name} onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })} placeholder="e.g. Diamond" /></div>
            <div><label style={S.label}>Price (₹)</label><input type="number" style={S.input} value={newPlan.price} onChange={(e) => setNewPlan({ ...newPlan, price: parseInt(e.target.value) || 0 })} /></div>
            <div><label style={S.label}>Duration (days)</label><input type="number" style={S.input} value={newPlan.duration_days} onChange={(e) => setNewPlan({ ...newPlan, duration_days: parseInt(e.target.value) || 0 })} /></div>
            <div><label style={S.label}>Display Order</label><input type="number" style={S.input} value={newPlan.display_order} onChange={(e) => setNewPlan({ ...newPlan, display_order: parseInt(e.target.value) || 0 })} /></div>
          </div>

          <h4 style={{ fontSize: 13, color: "#8B0A2E", marginBottom: 10, textTransform: "uppercase" }}>Permissions</h4>
          <div style={S.permsGrid}>
            {PERMISSION_FIELDS.map((p) => (
              <div key={p.key} style={S.permRow}>
                <span style={S.permLabel}>{p.label}</span>
                {p.type === "bool" ? (
                  <input type="checkbox" checked={newPlan.permissions[p.key] || false} onChange={() => toggleNewPermission(p.key)} style={{ width: 20, height: 20, accentColor: "#8B0A2E" }} />
                ) : (
                  <input type="number" value={newPlan.permissions[p.key] || 0} onChange={(e) => updateNewPermissionValue(p.key, parseInt(e.target.value) || 0)} style={{ width: 80, padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, textAlign: "center", fontFamily: "inherit" }} />
                )}
              </div>
            ))}
          </div>

          <button onClick={handleCreate} disabled={saving} style={{ ...S.btn, marginTop: 16, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Creating..." : "Create Plan"}
          </button>
        </div>
      )}

      {plans.map((plan) => {
        const isEditing = editingPlan?.id === plan.id;
        const perms = isEditing ? editingPlan.permissions : (plan.permissions || {});

        return (
          <div key={plan.id} style={S.planCard}>
            <div style={S.planHeader}>
              <div>
                {isEditing ? (
                  <input style={{ ...S.input, fontSize: 18, fontWeight: 700 }} value={editingPlan.name} onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })} />
                ) : (
                  <>
                    <div style={S.planName}>{plan.name}</div>
                    <div style={S.planPrice}>
                      ₹{plan.price} · {plan.duration_days === 9999 ? "Lifetime" : `${plan.duration_days} days`}
                      {!plan.is_active && <span style={{ marginLeft: 8, background: "#fee2e2", color: "#991b1b", padding: "2px 8px", borderRadius: 8, fontSize: 10, fontWeight: 700 }}>INACTIVE</span>}
                    </div>
                  </>
                )}
              </div>
              <div style={S.planBtns}>
                {isEditing ? (
                  <>
                    <button onClick={handleUpdate} disabled={saving} style={{ ...S.smallBtn, background: "#16a34a", color: "white", opacity: saving ? 0.6 : 1 }}>
                      {saving ? "Saving..." : "💾 Save"}
                    </button>
                    <button onClick={() => setEditingPlan(null)} style={{ ...S.smallBtn, background: "#f3f4f6", color: "#374151" }}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setEditingPlan({ ...plan, permissions: plan.permissions || {} })} style={{ ...S.smallBtn, background: "#eff6ff", color: "#1e40af" }}>✏️ Edit</button>
                    {plan.name !== "Free" && (
                      <button onClick={() => handleDelete(plan)} style={{ ...S.smallBtn, background: "#fee2e2", color: "#b91c1c" }}>🗑️ Delete</button>
                    )}
                  </>
                )}
              </div>
            </div>

            {isEditing && (
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div><label style={S.label}>Price (₹)</label><input type="number" style={S.input} value={editingPlan.price} onChange={(e) => setEditingPlan({ ...editingPlan, price: parseInt(e.target.value) || 0 })} /></div>
                <div><label style={S.label}>Duration (days)</label><input type="number" style={S.input} value={editingPlan.duration_days} onChange={(e) => setEditingPlan({ ...editingPlan, duration_days: parseInt(e.target.value) || 0 })} /></div>
                <div><label style={S.label}>Active?</label>
                  <select style={S.input} value={editingPlan.is_active} onChange={(e) => setEditingPlan({ ...editingPlan, is_active: e.target.value === "true" })}>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>
              </div>
            )}

            <div style={S.permsGrid}>
              {PERMISSION_FIELDS.map((p) => (
                <div key={p.key} style={S.permRow}>
                  <span style={S.permLabel}>{p.label}</span>
                  {p.type === "bool" ? (
                    isEditing ? (
                      <input type="checkbox" checked={perms[p.key] || false} onChange={() => togglePermission(p.key)} style={{ width: 20, height: 20, accentColor: "#8B0A2E" }} />
                    ) : (
                      <span style={{ fontSize: 16 }}>{perms[p.key] ? "✅" : "❌"}</span>
                    )
                  ) : (
                    isEditing ? (
                      <input type="number" value={perms[p.key] || 0} onChange={(e) => updatePermissionValue(p.key, parseInt(e.target.value) || 0)} style={{ width: 80, padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, textAlign: "center", fontFamily: "inherit" }} />
                    ) : (
                      <strong style={{ color: "#8B0A2E", fontSize: 14 }}>{perms[p.key] || 0}</strong>
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default AdminPlans;
