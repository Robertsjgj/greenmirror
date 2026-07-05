import { useState } from "react";
import { type MapKind, GREENHOUSES } from "../greenhouses";
import { useGreenhouse } from "../context/GreenhouseContext";
import { useSimulation } from "../context/SimulationContext";

interface SiteSwitcherSheetProps {
  open: boolean;
  onClose: () => void;
  currentUserName?: string;
  currentUserRole?: string;
  isAdmin?: boolean;
  onLogout?: () => Promise<void> | void;
  onOpenAdminUsers?: () => void;
  onOpenChangePassword?: () => void;
}

const SITE_EMOJIS: Record<MapKind, string> = {
  sydney: "🏡",
  truro: "🌿",
};

export function SiteSwitcherSheet({
  open,
  onClose,
  currentUserName,
  currentUserRole,
  isAdmin = false,
  onLogout,
  onOpenAdminUsers,
  onOpenChangePassword,
}: SiteSwitcherSheetProps) {
  const { greenhouse, setGreenhouse, clearGreenhouse } = useGreenhouse();
  const { isSimulating, startSimulation, stopSimulation } = useSimulation();
  const [loggingOut, setLoggingOut] = useState(false);

  const activekind = greenhouse?.mapKind;
  const isSignedIn = Boolean(currentUserName);

  async function handleLogout() {
    if (!onLogout) return;

    setLoggingOut(true);
    try {
      await onLogout();
      onClose();
    } finally {
      setLoggingOut(false);
    }
  }

  async function handleChangeGreenhouse() {
    if (isSignedIn && onLogout) {
      setLoggingOut(true);
      try {
        await onLogout();
        clearGreenhouse();
        onClose();
      } finally {
        setLoggingOut(false);
      }
      return;
    }

    clearGreenhouse();
    onClose();
  }

  return (
    <>
      <div className={`gm-scrim${open ? " open" : ""}`} onClick={onClose} />

      <div
        className={`gm-sheet${open ? " open" : ""}`}
        style={{ maxHeight: "82%" }}
      >
        <div className="gm-grab" />

        <div className="gm-sheet-body">
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "4px 0 14px",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.14em",
                  color: "var(--ink-3)",
                }}
              >
                ACCOUNT
              </div>

              <div
                style={{
                  fontFamily: "'Baloo 2', system-ui",
                  fontSize: 24,
                  color: "var(--ink)",
                  marginTop: 2,
                  fontWeight: 800,
                }}
              >
                Profile & greenhouse
              </div>
            </div>

            <button
              className="gm-icon-btn"
              onClick={onClose}
              aria-label="Close"
            >
              <span style={{ fontSize: 18 }}>✕</span>
            </button>
          </div>

          {/* Signed-in user card */}
          {isSignedIn && (
            <div
              style={{
                border: "1px solid var(--line)",
                background: "linear-gradient(135deg, #ecfdf5 0%, #ffffff 100%)",
                borderRadius: 24,
                padding: 16,
                marginBottom: 14,
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 18,
                  background: "var(--primary-soft)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 26,
                  flexShrink: 0,
                }}
              >
                👩‍🌾
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: "0.14em",
                    color: "var(--ink-3)",
                    textTransform: "uppercase",
                    marginBottom: 2,
                  }}
                >
                  Signed in as
                </div>

                <div
                  style={{
                    fontFamily: "'Baloo 2', system-ui",
                    fontSize: 20,
                    fontWeight: 800,
                    color: "var(--ink)",
                    lineHeight: 1.1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {currentUserName}
                </div>

                <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                  <span
                    className="gm-chip primary"
                    style={{
                      padding: "3px 8px",
                      fontSize: 10,
                      textTransform: "uppercase",
                    }}
                  >
                    {currentUserRole ?? "user"}
                  </span>

                  {isAdmin && (
                    <span
                      style={{
                        borderRadius: 999,
                        background: "#fef3c7",
                        color: "#92400e",
                        padding: "3px 8px",
                        fontSize: 10,
                        fontWeight: 900,
                        textTransform: "uppercase",
                      }}
                    >
                      Admin tools enabled
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {isAdmin && onOpenAdminUsers && (
            <button
              className="gm-row"
              onClick={() => {
                onClose();
                onOpenAdminUsers();
              }}
              style={{
                width: "100%",
                textAlign: "left",
                padding: 14,
                borderRadius: 22,
                borderColor: "#bbf7d0",
                background: "#ecfdf5",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 16,
                  flexShrink: 0,
                  background: "#bbf7d0",
                  color: "#166534",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 22,
                }}
              >
                👥
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: "'Baloo 2', system-ui",
                    fontSize: 18,
                    fontWeight: 800,
                    color: "var(--ink)",
                  }}
                >
                  Manage users
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: "var(--ink-3)",
                    marginTop: 1,
                    fontWeight: 600,
                  }}
                >
                  Create users and assign admin/user roles
                </div>
              </div>
            </button>
          )}

          {/* Greenhouse selector / current greenhouse */}
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: "var(--ink-3)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Greenhouse site
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.values(GREENHOUSES).map((gh) => {
              const active = gh.mapKind === activekind;
              const locked = isSignedIn && !active;

              return (
                <button
                  key={gh.mapKind}
                  className="gm-row"
                  disabled={locked}
                  onClick={() => {
                    if (locked) return;
                    if (!active) setGreenhouse(gh.mapKind);
                    onClose();
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    borderColor: active ? "var(--primary)" : "var(--line)",
                    background: active ? "var(--primary-soft)" : "var(--card)",
                    padding: 14,
                    borderRadius: 22,
                    opacity: locked ? 0.55 : 1,
                    cursor: locked ? "not-allowed" : "pointer",
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 16,
                      flexShrink: 0,
                      background: active ? "var(--primary)" : "var(--card-sub)",
                      color: active ? "white" : "var(--primary)",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 22,
                    }}
                  >
                    {active ? "✓" : SITE_EMOJIS[gh.mapKind]}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          fontFamily: "'Baloo 2', system-ui",
                          fontSize: 20,
                          color: "var(--ink)",
                          fontWeight: 800,
                        }}
                      >
                        {gh.name}
                      </div>

                      {active && (
                        <span
                          className="gm-chip primary"
                          style={{ padding: "2px 8px", fontSize: 10 }}
                        >
                          active
                        </span>
                      )}

                      {locked && (
                        <span
                          style={{
                            borderRadius: 999,
                            background: "#f1f5f9",
                            color: "#64748b",
                            padding: "2px 8px",
                            fontSize: 10,
                            fontWeight: 900,
                            textTransform: "uppercase",
                          }}
                        >
                          locked
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--ink-3)",
                        marginTop: 1,
                      }}
                    >
                      {gh.region}
                    </div>
                  </div>

                  {active && (
                    <span style={{ fontSize: 20, color: "var(--primary)" }}>
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Testing & simulation */}
          <div
            style={{
              marginTop: 20,
              paddingTop: 16,
              borderTop: "1px solid var(--line)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: "var(--ink-3)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Testing
            </div>

            <button
              className="gm-row"
              onClick={() => {
                if (isSimulating) {
                  stopSimulation();
                } else {
                  startSimulation();
                }
                onClose();
              }}
              style={{
                width: "100%",
                textAlign: "left",
                padding: 14,
                borderRadius: 22,
                borderColor: isSimulating ? "#f59e0b" : "var(--line)",
                background: isSimulating ? "#fffbeb" : "var(--card)",
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 16,
                  flexShrink: 0,
                  background: isSimulating ? "#fef3c7" : "var(--card-sub)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 22,
                }}
              >
                ⚗️
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: "'Baloo 2', system-ui",
                    fontSize: 18,
                    fontWeight: 800,
                    color: isSimulating ? "#92400e" : "var(--ink)",
                  }}
                >
                  {isSimulating ? "Stop simulation" : "Start simulation mode"}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: "var(--ink-3)",
                    marginTop: 1,
                    fontWeight: 600,
                  }}
                >
                  {isSimulating
                    ? "Currently running — generating fake sensor data"
                    : "Fake readings for testing before hardware is deployed"}
                </div>
              </div>

              {isSimulating && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#92400e",
                    background: "#fef3c7",
                    padding: "3px 8px",
                    borderRadius: 999,
                    flexShrink: 0,
                  }}
                >
                  ON
                </span>
              )}
            </button>
          </div>

          {/* Account actions */}
          <div
            style={{
              marginTop: 16,
              paddingTop: 16,
              borderTop: "1px solid var(--line)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: "var(--ink-3)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Account
            </div>

            {onOpenChangePassword && (
              <button
                className="gm-row"
                onClick={() => {
                  onClose();
                  onOpenChangePassword();
                }}
                disabled={loggingOut}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: 14,
                  borderRadius: 22,
                  marginBottom: 8,
                  borderColor: "#bbf7d0",
                  background: "#ecfdf5",
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 16,
                    flexShrink: 0,
                    background: "#bbf7d0",
                    color: "#166534",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 22,
                  }}
                >
                  🔐
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "'Baloo 2', system-ui",
                      fontSize: 18,
                      fontWeight: 800,
                      color: "var(--ink)",
                    }}
                  >
                    Change password
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--ink-3)",
                      marginTop: 1,
                      fontWeight: 600,
                    }}
                  >
                    Update your own account password
                  </div>
                </div>
              </button>
            )}

            <button
              className="gm-row"
              onClick={handleChangeGreenhouse}
              disabled={loggingOut}
              style={{
                width: "100%",
                textAlign: "left",
                padding: 14,
                borderRadius: 22,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 16,
                  flexShrink: 0,
                  background: "var(--card-sub)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 22,
                }}
              >
                🔄
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: "'Baloo 2', system-ui",
                    fontSize: 18,
                    fontWeight: 800,
                    color: "var(--ink)",
                  }}
                >
                  {isSignedIn
                    ? "Sign out and choose greenhouse"
                    : "Change greenhouse"}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: "var(--ink-3)",
                    marginTop: 1,
                    fontWeight: 600,
                  }}
                >
                  {isSignedIn
                    ? "Return to the greenhouse selector"
                    : "Return to the onboarding selector"}
                </div>
              </div>
            </button>

            {onLogout && (
              <button
                className="gm-row"
                onClick={handleLogout}
                disabled={loggingOut}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: 14,
                  marginTop: 8,
                  borderRadius: 22,
                  borderColor: "#fecaca",
                  background: "#fef2f2",
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 16,
                    flexShrink: 0,
                    background: "#fee2e2",
                    color: "#b91c1c",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 22,
                  }}
                >
                  🚪
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "'Baloo 2', system-ui",
                      fontSize: 18,
                      fontWeight: 800,
                      color: "#991b1b",
                    }}
                  >
                    {loggingOut ? "Logging out…" : "Logout"}
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      color: "#b91c1c",
                      marginTop: 1,
                      fontWeight: 600,
                    }}
                  >
                    End this GreenMirror session
                  </div>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
