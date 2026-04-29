"use client";

import { useEffect, useState, FormEvent } from "react";
import {
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth,
} from "@clerk/nextjs";

import CsvImport from "../components/CsvImport";
import { isValidPlugin } from "../plugins/pluginRegistry";

type Field = {
  name?: string;
  type?: string;
  label?: string;
  required?: boolean;
};

type Entity = {
  name: string;
  fields?: Field[];
};

type PageConfig = {
  title?: string;
  entity?: string;
  components?: string[];
  actions?: {
    create?: boolean;
    update?: boolean;
    delete?: boolean;
    csvImport?: boolean;
  };
};

type AppConfig = {
  appName?: string;
  plugins?: string[];
  entities?: Entity[];
  pages?: PageConfig[];
};

type ValidationResult = {
  validRows: Record<string, any>[];
  invalidRows: {
    rowNumber: number;
    row: Record<string, any>;
    errors: string[];
  }[];
};

type NotificationItem = {
  id: string;
  userId: string;
  message: string;
  type: string;
  createdAt: string;
};

type AuditLogItem = {
  id: string;
  userId: string;
  action: string;
  entityName: string;
  message: string;
  metadata?: Record<string, any>;
  createdAt: string;
};

const API_BASE_URL = "http://localhost:5000";

const SUPPORTED_FIELD_TYPES = ["text", "email", "number", "date", "password"];
const SUPPORTED_COMPONENTS = ["form", "table"];

function getSafeAppName(config: AppConfig | null) {
  return config?.appName || "Generated App";
}

function getSafeEntities(config: AppConfig | null) {
  if (!config || !Array.isArray(config.entities)) {
    return [];
  }

  return config.entities.filter((entity) => entity && entity.name);
}

function getSafePages(config: AppConfig | null) {
  if (!config || !Array.isArray(config.pages)) {
    return [];
  }

  return config.pages;
}

function getSafeFieldLabel(field: Field) {
  return field.label || field.name || "Unnamed Field";
}

function getSafeInputType(field: Field) {
  if (!field.type) return "text";

  if (SUPPORTED_FIELD_TYPES.includes(field.type)) {
    return field.type;
  }

  return "text";
}

function getSafeFields(entity: Entity | undefined | null) {
  if (!entity || !Array.isArray(entity.fields)) {
    return [];
  }

  return entity.fields.filter((field) => field && field.name);
}

function getSafeComponents(page: PageConfig) {
  if (!Array.isArray(page.components)) {
    return [];
  }

  return page.components.filter((component) => typeof component === "string");
}

function getUnsupportedComponents(page: PageConfig) {
  return getSafeComponents(page).filter(
    (component) => !SUPPORTED_COMPONENTS.includes(component)
  );
}

function getSafeActions(page: PageConfig) {
  return {
    create: page.actions?.create !== false,
    update: page.actions?.update !== false,
    delete: page.actions?.delete !== false,
    csvImport: page.actions?.csvImport !== false,
  };
}

function getPageTitle(page: PageConfig, fallbackEntityName?: string) {
  return page.title || fallbackEntityName || "Untitled Page";
}

export default function Home() {
  const { isSignedIn, userId } = useAuth();

  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [records, setRecords] = useState<Record<string, any[]>>({});
  const [csvRows, setCsvRows] = useState<Record<string, any[]>>({});
  const [columnMapping, setColumnMapping] = useState<
    Record<string, Record<string, string>>
  >({});
  const [editingRecords, setEditingRecords] = useState<Record<string, any>>({});

  const isPluginEnabled = (pluginName: string) => {
    return (
      isValidPlugin(pluginName) &&
      Array.isArray(config?.plugins) &&
      config.plugins.includes(pluginName)
    );
  };

  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch(`${API_BASE_URL}/config`);

        if (!res.ok) {
          throw new Error("Failed to load config");
        }

        const data: AppConfig = await res.json();
        setConfig(data);
        setConfigError(null);

        if (userId) {
          const safeEntities = getSafeEntities(data);

          for (const entity of safeEntities) {
            await loadRecords(entity.name, userId);
          }
        }
      } catch (error) {
        console.error("loadConfig error:", error);
        setConfigError("Could not load app config from backend.");
      }
    }

    loadConfig();
  }, [userId]);

  async function loadRecords(entityName: string, currentUserId: string) {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/${entityName}?userId=${currentUserId}`
      );

      if (!res.ok) {
        throw new Error("Failed to load records");
      }

      const data = await res.json();

      setRecords((prev) => ({
        ...prev,
        [entityName]: Array.isArray(data) ? data : [],
      }));
    } catch (error) {
      console.error("loadRecords error:", error);

      setRecords((prev) => ({
        ...prev,
        [entityName]: [],
      }));
    }
  }

  function handleCsvParsed(entityName: string, rows: any[]) {
    setCsvRows((prev) => ({
      ...prev,
      [entityName]: rows,
    }));

    const firstRow = rows[0] || {};
    const csvColumns = Object.keys(firstRow);

    const autoMapping: Record<string, string> = {};

    csvColumns.forEach((column) => {
      autoMapping[column] = column;
    });

    setColumnMapping((prev) => ({
      ...prev,
      [entityName]: autoMapping,
    }));
  }

  function transformRows(entityName: string) {
    const rows = csvRows[entityName] || [];
    const mapping = columnMapping[entityName] || {};

    return rows.map((row) => {
      const newRow: Record<string, any> = {};

      for (const csvColumn in mapping) {
        const appField = mapping[csvColumn];

        if (appField) {
          newRow[appField] = row[csvColumn];
        }
      }

      return newRow;
    });
  }

  function validateRows(
    entity: Entity,
    rows: Record<string, any>[]
  ): ValidationResult {
    const requiredFields = getSafeFields(entity).filter(
      (field) => field.required
    );

    const validRows: Record<string, any>[] = [];
    const invalidRows: ValidationResult["invalidRows"] = [];

    rows.forEach((row, index) => {
      const errors: string[] = [];

      requiredFields.forEach((field) => {
        if (!field.name) return;

        const value = row[field.name];

        if (
          value === undefined ||
          value === null ||
          String(value).trim() === ""
        ) {
          errors.push(`${getSafeFieldLabel(field)} is required`);
        }
      });

      getSafeFields(entity).forEach((field) => {
        if (!field.name) return;

        const value = row[field.name];
        const inputType = getSafeInputType(field);

        if (
          inputType === "email" &&
          value &&
          !String(value).includes("@")
        ) {
          errors.push(`${getSafeFieldLabel(field)} must be a valid email`);
        }

        if (
          inputType === "number" &&
          value !== undefined &&
          value !== null &&
          String(value).trim() !== "" &&
          Number.isNaN(Number(value))
        ) {
          errors.push(`${getSafeFieldLabel(field)} must be a number`);
        }
      });

      if (errors.length > 0) {
        invalidRows.push({
          rowNumber: index + 1,
          row,
          errors,
        });
      } else {
        validRows.push(row);
      }
    });

    return { validRows, invalidRows };
  }

  async function handleMappedImport(entity: Entity) {
    if (!userId) return;

    const transformedRows = transformRows(entity.name);
    const { validRows, invalidRows } = validateRows(entity, transformedRows);

    if (invalidRows.length > 0) {
      alert("Import blocked. Fix invalid rows first.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/${entity.name}/bulk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rows: validRows,
          userId,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        console.error("CSV import backend error:", errorData);
        throw new Error("CSV import failed");
      }

      alert("Validated CSV imported successfully");

      await loadRecords(entity.name, userId);

      setCsvRows((prev) => ({
        ...prev,
        [entity.name]: [],
      }));

      setColumnMapping((prev) => ({
        ...prev,
        [entity.name]: {},
      }));
    } catch (error) {
      console.error("handleMappedImport error:", error);
      alert("Error importing CSV");
    }
  }

  function handleEdit(entityName: string, row: any) {
    setEditingRecords((prev) => ({
      ...prev,
      [entityName]: row,
    }));

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function handleDelete(entityName: string, id: number | string) {
    if (!userId) return;

    const confirmed = confirm("Are you sure you want to delete this record?");

    if (!confirmed) return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/${entityName}/${id}?userId=${userId}`,
        {
          method: "DELETE",
        }
      );

      if (!res.ok) {
        throw new Error("Delete failed");
      }

      alert("Record deleted successfully");

      await loadRecords(entityName, userId);
    } catch (error) {
      console.error("handleDelete error:", error);
      alert("Error deleting record");
    }
  }

  function clearEditing(entityName: string) {
    setEditingRecords((prev) => ({
      ...prev,
      [entityName]: null,
    }));
  }

  if (configError) {
    return (
      <main className="p-6 max-w-3xl mx-auto">
        <div className="border border-red-300 bg-red-50 text-red-700 p-4 rounded">
          {configError}
        </div>
      </main>
    );
  }

  if (!config) {
    return <p className="p-6">Loading config...</p>;
  }

  const safeAppName = getSafeAppName(config);
  const safePages = getSafePages(config);
  const safeEntities = getSafeEntities(config);

  if (!isSignedIn) {
    return (
      <main className="p-6 max-w-xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">{safeAppName}</h1>
        <p className="mb-4">Please sign in or create an account to continue.</p>

        <div className="flex flex-col sm:flex-row gap-3">
          <SignInButton mode="modal">
            <button className="bg-black text-white px-4 py-2 rounded">
              Sign In
            </button>
          </SignInButton>

          <SignUpButton mode="modal">
            <button className="border px-4 py-2 rounded">Sign Up</button>
          </SignUpButton>
        </div>
      </main>
    );
  }

  return (
    <main className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold">{safeAppName}</h1>

        <div className="flex items-center gap-4">
          {userId && isPluginEnabled("notifications") && (
            <SafeNotifications userId={userId} />
          )}

          <UserButton />
        </div>
      </div>

      {userId && isPluginEnabled("auditLog") && <SafeAuditLogs userId={userId} />}

      {!Array.isArray(config.entities) && (
        <div className="border border-red-300 bg-red-50 text-red-700 p-3 rounded mb-4">
          Invalid config: <code>entities</code> must be an array.
        </div>
      )}

      {!Array.isArray(config.pages) && (
        <div className="border border-red-300 bg-red-50 text-red-700 p-3 rounded mb-4">
          Invalid config: <code>pages</code> must be an array.
        </div>
      )}

      {safePages.length === 0 && (
        <div className="border border-yellow-300 bg-yellow-50 text-yellow-800 p-3 rounded mb-4">
          No pages configured.
        </div>
      )}

      {safePages.map((page, pageIndex) => {
        const entity = safeEntities.find((e) => e.name === page.entity);
        const pageKey = page.title || page.entity || `page-${pageIndex}`;
        const pageTitle = getPageTitle(page, page.entity);
        const safeComponents = getSafeComponents(page);
        const unsupportedComponents = getUnsupportedComponents(page);
        const actions = getSafeActions(page);

        const canCreate = actions.create;
        const canUpdate = actions.update;
        const canDelete = actions.delete;
        const canCsvImport = actions.csvImport;

        if (!page.entity) {
          return (
            <section key={pageKey} className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">{pageTitle}</h2>

              <div className="border border-red-300 bg-red-50 text-red-700 p-4 rounded">
                Page config is missing an entity name.
              </div>
            </section>
          );
        }

        if (!entity) {
          return (
            <section key={pageKey} className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">{pageTitle}</h2>

              <div className="border border-red-300 bg-red-50 text-red-700 p-4 rounded">
                Entity not found: {page.entity}
              </div>
            </section>
          );
        }

        const safeFields = getSafeFields(entity);
        const currentCsvRows = csvRows[entity.name] || [];
        const currentMapping = columnMapping[entity.name] || {};
        const csvColumns =
          currentCsvRows.length > 0 ? Object.keys(currentCsvRows[0]) : [];

        const transformedRows = transformRows(entity.name);
        const validation = validateRows(entity, transformedRows);
        const editingRecord = editingRecords[entity.name];

        return (
          <section key={pageKey} className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">{pageTitle}</h2>

            {safeFields.length === 0 && (
              <div className="border border-red-300 bg-red-50 text-red-700 p-3 rounded mb-4">
                No valid fields configured for entity: {entity.name}
              </div>
            )}

            {unsupportedComponents.length > 0 && (
              <div className="border border-yellow-300 bg-yellow-50 text-yellow-800 p-3 rounded mb-4">
                Unsupported component(s): {unsupportedComponents.join(", ")}
              </div>
            )}

            {safeComponents.length === 0 && (
              <div className="border border-red-300 bg-red-50 text-red-700 p-3 rounded mb-4">
                No valid components configured for this page.
              </div>
            )}

            {isPluginEnabled("csvImport") && canCsvImport && (
              <div className="mb-4">
                <CsvImport
                  onDataParsed={(rows) => handleCsvParsed(entity.name, rows)}
                />
              </div>
            )}

            {isPluginEnabled("csvImport") &&
              canCsvImport &&
              currentCsvRows.length > 0 && (
                <div className="border p-4 rounded-md mb-4 overflow-x-auto">
                  <h2 className="text-lg font-semibold mb-3">
                    CSV Column Mapping
                  </h2>

                  {csvColumns.map((column) => (
                    <div
                      key={column}
                      className="mb-2 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"
                    >
                      <span className="sm:w-40 font-medium break-all">
                        {column}
                      </span>
                      <span>→</span>

                      <select
                        className="border p-2 rounded w-full sm:w-auto"
                        value={currentMapping[column] || ""}
                        onChange={(e) => {
                          setColumnMapping((prev) => ({
                            ...prev,
                            [entity.name]: {
                              ...prev[entity.name],
                              [column]: e.target.value,
                            },
                          }));
                        }}
                      >
                        <option value="">Do not import</option>

                        {safeFields.map((field) => (
                          <option key={field.name} value={field.name}>
                            {getSafeFieldLabel(field)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}

                  <div className="mt-4 mb-3 flex flex-col sm:flex-row gap-2 sm:gap-4">
                    <p className="text-green-700">
                      Valid rows: {validation.validRows.length}
                    </p>
                    <p className="text-red-700">
                      Invalid rows: {validation.invalidRows.length}
                    </p>
                  </div>

                  {validation.invalidRows.length > 0 && (
                    <div className="bg-red-50 border border-red-300 p-3 rounded mb-3">
                      <h3 className="font-semibold text-red-700 mb-2">
                        Invalid Rows
                      </h3>

                      <pre className="text-sm overflow-auto">
                        {JSON.stringify(
                          validation.invalidRows.slice(0, 5),
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  )}

                  <h3 className="font-semibold mt-4 mb-2">Preview</h3>

                  <pre className="text-sm bg-gray-100 p-3 rounded overflow-auto mb-3">
                    {JSON.stringify(transformedRows.slice(0, 5), null, 2)}
                  </pre>

                  <button
                    onClick={() => handleMappedImport(entity)}
                    className="bg-green-600 text-white px-4 py-2 rounded"
                  >
                    Import Validated CSV
                  </button>
                </div>
              )}

            {safeComponents.includes("form") &&
              userId &&
              (canCreate || canUpdate) && (
                <DynamicForm
                  entity={entity}
                  userId={userId}
                  editingRecord={editingRecord}
                  canCreate={canCreate}
                  canUpdate={canUpdate}
                  onSaved={() => loadRecords(entity.name, userId)}
                  onCancelEdit={() => clearEditing(entity.name)}
                />
              )}

            {safeComponents.includes("table") && (
              <DynamicTable
                entity={entity}
                data={records[entity.name] || []}
                canUpdate={canUpdate}
                canDelete={canDelete}
                onEdit={(row) => handleEdit(entity.name, row)}
                onDelete={(id) => handleDelete(entity.name, id)}
              />
            )}
          </section>
        );
      })}
    </main>
  );
}

function SafeNotifications({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);

  async function loadNotifications() {
    try {
      const res = await fetch(`${API_BASE_URL}/notifications?userId=${userId}`);

      if (!res.ok) {
        throw new Error("Failed to load notifications");
      }

      const data = await res.json();
      setNotifications(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("loadNotifications error:", error);
      setNotifications([]);
    }
  }

  useEffect(() => {
    if (!userId) return;

    loadNotifications();
  }, [userId]);

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen((prev) => !prev);
          loadNotifications();
        }}
        className="border px-3 py-2 rounded"
      >
        Notifications ({notifications.length})
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white border rounded shadow-lg z-50 p-3">
          <h3 className="font-semibold mb-2">Notifications</h3>

          {notifications.length === 0 ? (
            <p className="text-sm text-gray-500">No notifications yet</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-auto">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className="border rounded p-2 text-sm bg-gray-50"
                >
                  <p>{notification.message}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(notification.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SafeAuditLogs({ userId }: { userId: string }) {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [open, setOpen] = useState(false);

  async function loadAuditLogs() {
    try {
      const res = await fetch(`${API_BASE_URL}/audit-logs?userId=${userId}`);

      if (!res.ok) {
        throw new Error("Failed to load audit logs");
      }

      const data = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("loadAuditLogs error:", error);
      setLogs([]);
    }
  }

  useEffect(() => {
    if (!userId) return;

    loadAuditLogs();
  }, [userId]);

  return (
    <div className="border rounded p-4 mb-6 bg-gray-50">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <h2 className="text-lg font-semibold">Audit Logs</h2>

        <button
          onClick={() => {
            setOpen((prev) => !prev);
            loadAuditLogs();
          }}
          className="border px-3 py-1 rounded"
        >
          {open ? "Hide" : "Show"} Logs ({logs.length})
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2 max-h-80 overflow-auto">
          {logs.length === 0 ? (
            <p className="text-sm text-gray-500">No audit logs yet</p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="border rounded p-2 bg-white text-sm">
                <p>
                  <strong>{log.action}</strong> — {log.message}
                </p>
                <p className="text-xs text-gray-500">
                  Entity: {log.entityName} |{" "}
                  {new Date(log.createdAt).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function DynamicForm({
  entity,
  userId,
  editingRecord,
  canCreate,
  canUpdate,
  onSaved,
  onCancelEdit,
}: {
  entity: Entity;
  userId: string;
  editingRecord: any;
  canCreate: boolean;
  canUpdate: boolean;
  onSaved: () => void;
  onCancelEdit: () => void;
}) {
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const isEditing = Boolean(editingRecord);
  const safeFields = getSafeFields(entity);

  if (!isEditing && !canCreate) {
    return null;
  }

  if (isEditing && !canUpdate) {
    return null;
  }

  useEffect(() => {
    if (editingRecord) {
      const initialData: Record<string, string> = {};

      safeFields.forEach((field) => {
        if (!field.name) return;
        initialData[field.name] = editingRecord[field.name] || "";
      });

      setFormData(initialData);
    } else {
      setFormData({});
    }
  }, [editingRecord, entity]);

  function handleChange(fieldName: string, value: string) {
    setFormData((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);

    for (const field of safeFields) {
      if (!field.name) continue;

      if (field.required && !formData[field.name]) {
        alert(`${getSafeFieldLabel(field)} is required`);
        setLoading(false);
        return;
      }

      const inputType = getSafeInputType(field);
      const value = formData[field.name];

      if (inputType === "email" && value && !String(value).includes("@")) {
        alert(`${getSafeFieldLabel(field)} must be a valid email`);
        setLoading(false);
        return;
      }

      if (
        inputType === "number" &&
        value !== undefined &&
        value !== null &&
        String(value).trim() !== "" &&
        Number.isNaN(Number(value))
      ) {
        alert(`${getSafeFieldLabel(field)} must be a number`);
        setLoading(false);
        return;
      }
    }

    try {
      const url = isEditing
        ? `${API_BASE_URL}/api/${entity.name}/${editingRecord.id}`
        : `${API_BASE_URL}/api/${entity.name}`;

      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          userId,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);

        if (errorData?.details && Array.isArray(errorData.details)) {
          alert(errorData.details.join("\n"));
        } else if (errorData?.error) {
          alert(errorData.error);
        } else {
          alert("Failed to save data");
        }

        throw new Error("Failed to save data");
      }

      setFormData({});
      onCancelEdit();
      onSaved();

      alert(isEditing ? "Record updated successfully" : "Record saved successfully");
    } catch (error) {
      console.error("handleSubmit error:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border p-4 rounded mb-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-3">
        <h3 className="font-semibold">
          {isEditing ? `Edit ${entity.name}` : `Add ${entity.name}`}
        </h3>

        {isEditing && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="border px-3 py-1 rounded"
          >
            Cancel Edit
          </button>
        )}
      </div>

      {safeFields.length === 0 ? (
        <div className="border border-red-300 bg-red-50 text-red-700 p-3 rounded">
          Cannot render form because this entity has no valid fields.
        </div>
      ) : (
        safeFields.map((field) => {
          if (!field.name) return null;

          return (
            <div key={field.name} className="mb-3">
              <label className="block mb-1">
                {getSafeFieldLabel(field)}
                {field.required && <span className="text-red-600"> *</span>}
              </label>

              <input
                type={getSafeInputType(field)}
                required={field.required}
                value={formData[field.name] || ""}
                onChange={(e) => handleChange(field.name as string, e.target.value)}
                className="border p-2 rounded w-full"
              />

              {field.type && !SUPPORTED_FIELD_TYPES.includes(field.type) && (
                <p className="text-xs text-yellow-700 mt-1">
                  Unknown field type "{field.type}" rendered as text input.
                </p>
              )}
            </div>
          );
        })
      )}

      {safeFields.length > 0 && (
        <button
          disabled={loading}
          className={`text-white px-4 py-2 rounded disabled:opacity-50 ${
            isEditing ? "bg-blue-600" : "bg-black"
          }`}
        >
          {loading ? "Saving..." : isEditing ? "Update" : "Save"}
        </button>
      )}
    </form>
  );
}

function DynamicTable({
  entity,
  data,
  canUpdate,
  canDelete,
  onEdit,
  onDelete,
}: {
  entity: Entity;
  data: any[];
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (row: any) => void;
  onDelete: (id: number | string) => void;
}) {
  const safeFields = getSafeFields(entity);

  return (
    <div className="w-full overflow-x-auto">
      <table className="border w-full min-w-[600px]">
        <thead>
          <tr>
            {safeFields.map((field) => (
              <th key={field.name} className="border p-2 text-left">
                {getSafeFieldLabel(field)}
              </th>
            ))}

            {(canUpdate || canDelete) && (
              <th className="border p-2 text-left">Actions</th>
            )}
          </tr>
        </thead>

        <tbody>
          {safeFields.length === 0 ? (
            <tr>
              <td
                colSpan={canUpdate || canDelete ? 1 : 1}
                className="border p-2 text-red-600"
              >
                Cannot render table because this entity has no valid fields.
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={safeFields.length + (canUpdate || canDelete ? 1 : 0)}
                className="border p-2 text-gray-400"
              >
                No data yet
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr key={row.id || JSON.stringify(row)}>
                {safeFields.map((field) => (
                  <td key={field.name} className="border p-2">
                    {field.name ? row[field.name] : ""}
                  </td>
                ))}

                {(canUpdate || canDelete) && (
                  <td className="border p-2">
                    <div className="flex gap-2">
                      {canUpdate && (
                        <button
                          onClick={() => onEdit(row)}
                          className="bg-blue-600 text-white px-3 py-1 rounded"
                        >
                          Edit
                        </button>
                      )}

                      {canDelete && (
                        <button
                          onClick={() => onDelete(row.id)}
                          className="bg-red-600 text-white px-3 py-1 rounded"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}