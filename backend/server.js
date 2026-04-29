require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const config = require("../shared/app-config.json");

const app = express();

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter,
});

app.use(cors());
app.use(express.json());

// Check if entity exists in app-config.json
function isValidEntity(entityName) {
  return Boolean(getEntityConfig(entityName));
}
// Check if plugin is enabled from config
function isPluginEnabled(pluginName) {
  return Array.isArray(config.plugins) && config.plugins.includes(pluginName);
}

// Remove fields that should not be stored inside JSON data
function cleanRecordData(body) {
  const { id, createdAt, updatedAt, entity, ...cleanData } = body;
  return cleanData;
}

function getEntityConfig(entityName) {
  if (!Array.isArray(config.entities)) {
    return null;
  }

  return config.entities.find((entity) => entity.name === entityName) || null;
}

function getSafeFields(entity) {
  if (!entity || !Array.isArray(entity.fields)) {
    return [];
  }

  return entity.fields;
}

function isSupportedFieldType(type) {
  const supportedTypes = ["text", "email", "number", "date", "password"];

  if (!type) {
    return true;
  }

  return supportedTypes.includes(type);
}

function validateRecordAgainstConfig(entityName, data) {
  const entity = getEntityConfig(entityName);

  if (!entity) {
    return {
      isValid: false,
      errors: ["Invalid entity"],
    };
  }

  const fields = getSafeFields(entity);
  const errors = [];

  if (!fields.length) {
    errors.push(`Entity "${entityName}" has no valid fields configured`);
  }

  for (const field of fields) {
    const fieldName = field.name;
    const fieldLabel = field.label || field.name || "Unknown field";
    const fieldType = field.type || "text";

    if (!fieldName) {
      errors.push("A field is missing a name in the config");
      continue;
    }

    if (!isSupportedFieldType(fieldType)) {
      errors.push(`Unsupported field type "${fieldType}" for ${fieldName}`);
      continue;
    }

    const value = data[fieldName];

    if (
      field.required &&
      (value === undefined || value === null || String(value).trim() === "")
    ) {
      errors.push(`${fieldLabel} is required`);
    }

    if (
      fieldType === "email" &&
      value &&
      !String(value).includes("@")
    ) {
      errors.push(`${fieldLabel} must be a valid email`);
    }

    if (
      fieldType === "number" &&
      value !== undefined &&
      value !== null &&
      String(value).trim() !== "" &&
      Number.isNaN(Number(value))
    ) {
      errors.push(`${fieldLabel} must be a number`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

function validateBulkRowsAgainstConfig(entityName, rows) {
  const errors = [];
  const validRows = [];

  if (!Array.isArray(rows)) {
    return {
      isValid: false,
      errors: ["rows must be an array"],
      validRows: [],
    };
  }

  rows.forEach((row, index) => {
    const result = validateRecordAgainstConfig(entityName, row);

    if (!result.isValid) {
      errors.push({
        rowNumber: index + 1,
        errors: result.errors,
        row,
      });
    } else {
      validRows.push(row);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    validRows,
  };
}

// Convert Prisma AppRecord into the same flat format your frontend expects
function formatRecord(record) {
  return {
    id: record.id,
    ...record.data,
    userId: record.userId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

// Notification helper using PostgreSQL
async function addNotification(userId, message, type = "info") {
  if (!userId) return;

  await prisma.notification.create({
    data: {
      userId,
      message,
      type,
    },
  });
}

// Audit log helper using PostgreSQL
async function addAuditLog(userId, action, entityName, message, metadata = {}) {
  if (!userId) return;

  await prisma.auditLog.create({
    data: {
      userId,
      action,
      entityName,
      message,
      metadata,
    },
  });
}

// Plugin registry with hooks
const pluginRegistry = {
  notifications: {
    afterCreate: async ({ userId, entityName }) => {
      if (!userId) return;
      await addNotification(userId, `Added new ${entityName}`, "success");
    },

    afterUpdate: async ({ userId, entityName }) => {
      if (!userId) return;
      await addNotification(userId, `Updated ${entityName} record`, "success");
    },

    afterDelete: async ({ userId, entityName }) => {
      if (!userId) return;
      await addNotification(userId, `Deleted ${entityName} record`, "success");
    },

    afterBulkImport: async ({ userId, entityName, count }) => {
      if (!userId) return;

      await addNotification(
        userId,
        `Imported ${count} records into ${entityName}`,
        "success"
      );
    },
  },

  csvImport: {
    afterBulkImport: async ({ entityName, count }) => {
      console.log(
        `[csvImport plugin] Imported ${count} records into ${entityName}`
      );
    },
  },

  auditLog: {
    afterCreate: async ({ userId, entityName, item }) => {
      if (!userId) return;

      await addAuditLog(
        userId,
        "create",
        entityName,
        `Created new ${entityName} record`,
        {
          recordId: item.id,
        }
      );
    },

    afterUpdate: async ({ userId, entityName, item }) => {
      if (!userId) return;

      await addAuditLog(
        userId,
        "update",
        entityName,
        `Updated ${entityName} record`,
        {
          recordId: item.id,
        }
      );
    },

    afterDelete: async ({ userId, entityName, item }) => {
      if (!userId) return;

      await addAuditLog(
        userId,
        "delete",
        entityName,
        `Deleted ${entityName} record`,
        {
          recordId: item.id,
        }
      );
    },

    afterBulkImport: async ({ userId, entityName, count, items }) => {
      if (!userId) return;

      await addAuditLog(
        userId,
        "bulk_import",
        entityName,
        `Imported ${count} records into ${entityName}`,
        {
          count,
          recordIds: items.map((item) => item.id),
        }
      );
    },
  },
};

// Run enabled plugin hooks
async function runHook(hookName, context) {
  if (!Array.isArray(config.plugins)) return;

  for (const pluginName of config.plugins) {
    const plugin = pluginRegistry[pluginName];

    if (!plugin) continue;

    const hook = plugin[hookName];

    if (typeof hook === "function") {
      await hook(context);
    }
  }
}

// Health check
app.get("/", (req, res) => {
  res.json({
    message: "Dynamic backend is running",
    appName: config.appName,
    plugins: config.plugins || [],
    database: "PostgreSQL + Prisma",
  });
});

// Send config to frontend
app.get("/config", (req, res) => {
  res.json(config);
});

// Get notifications
app.get("/notifications", async (req, res) => {
  try {
    const userId = req.query.userId;

    if (!isPluginEnabled("notifications")) {
      return res.json([]);
    }

    if (!userId) {
      return res.json([]);
    }

    const userNotifications = await prisma.notification.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(userNotifications);
  } catch (error) {
    console.error("Get notifications error:", error);

    res.status(500).json({
      error: "Failed to fetch notifications",
    });
  }
});

// Get audit logs
app.get("/audit-logs", async (req, res) => {
  try {
    const userId = req.query.userId;

    if (!isPluginEnabled("auditLog")) {
      return res.json([]);
    }

    if (!userId) {
      return res.json([]);
    }

    const userAuditLogs = await prisma.auditLog.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(userAuditLogs);
  } catch (error) {
    console.error("Get audit logs error:", error);

    res.status(500).json({
      error: "Failed to fetch audit logs",
    });
  }
});

// Dynamic GET API
app.get("/api/:entity", async (req, res) => {
  try {
    const entityName = req.params.entity;
    const userId = req.query.userId;

    if (!isValidEntity(entityName)) {
      return res.status(404).json({
        error: "Entity not found",
      });
    }

    const where = {
      entity: entityName,
    };

    if (userId) {
      where.userId = userId;
    }

    const records = await prisma.appRecord.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(records.map(formatRecord));
  } catch (error) {
    console.error("GET records error:", error);

    res.status(500).json({
      error: "Failed to fetch records",
    });
  }
});

// Dynamic POST API
app.post("/api/:entity", async (req, res) => {
  try {
    const entityName = req.params.entity;
    const userId = req.body.userId;

    if (!isValidEntity(entityName)) {
      return res.status(404).json({
        error: "Entity not found",
      });
    }

    if (!userId) {
      return res.status(400).json({
        error: "userId is required",
      });
    }

    const cleanData = cleanRecordData(req.body);

    const validation = validateRecordAgainstConfig(entityName, cleanData);

if (!validation.isValid) {
  return res.status(400).json({
    error: "Validation failed",
    details: validation.errors,
  });
}

    const newRecord = await prisma.appRecord.create({
      data: {
        entity: entityName,
        userId,
        data: cleanData,
      },
    });

    const formattedRecord = formatRecord(newRecord);

    await runHook("afterCreate", {
      userId,
      entityName,
      item: formattedRecord,
    });

    res.status(201).json(formattedRecord);
  } catch (error) {
    console.error("POST record error:", error);

    res.status(500).json({
      error: "Failed to create record",
    });
  }
});

// Dynamic UPDATE API
app.put("/api/:entity/:id", async (req, res) => {
  try {
    const entityName = req.params.entity;
    const id = req.params.id;
    const userId = req.body.userId;

    if (!isValidEntity(entityName)) {
      return res.status(404).json({
        error: "Entity not found",
      });
    }

    if (!userId) {
      return res.status(400).json({
        error: "userId is required",
      });
    }

    const existingRecord = await prisma.appRecord.findFirst({
      where: {
        id,
        entity: entityName,
        userId,
      },
    });

    if (!existingRecord) {
      return res.status(404).json({
        error: "Record not found or unauthorized",
      });
    }

    const cleanData = cleanRecordData(req.body);

    const validation = validateRecordAgainstConfig(entityName, cleanData);

if (!validation.isValid) {
  return res.status(400).json({
    error: "Validation failed",
    details: validation.errors,
  });
}

    const updatedRecord = await prisma.appRecord.update({
      where: {
        id,
      },
      data: {
        data: cleanData,
      },
    });

    const formattedRecord = formatRecord(updatedRecord);

    await runHook("afterUpdate", {
      userId,
      entityName,
      item: formattedRecord,
    });

    res.json(formattedRecord);
  } catch (error) {
    console.error("PUT record error:", error);

    res.status(500).json({
      error: "Failed to update record",
    });
  }
});

// Dynamic DELETE API
app.delete("/api/:entity/:id", async (req, res) => {
  try {
    const entityName = req.params.entity;
    const id = req.params.id;
    const userId = req.query.userId;

    if (!isValidEntity(entityName)) {
      return res.status(404).json({
        error: "Entity not found",
      });
    }

    if (!userId) {
      return res.status(400).json({
        error: "userId is required",
      });
    }

    const existingRecord = await prisma.appRecord.findFirst({
      where: {
        id,
        entity: entityName,
        userId,
      },
    });

    if (!existingRecord) {
      return res.status(404).json({
        error: "Record not found or unauthorized",
      });
    }

    await prisma.appRecord.delete({
      where: {
        id,
      },
    });

    const deletedItem = formatRecord(existingRecord);

    await runHook("afterDelete", {
      userId,
      entityName,
      item: deletedItem,
    });

    res.json({
      success: true,
      deleted: deletedItem,
    });
  } catch (error) {
    console.error("DELETE record error:", error);

    res.status(500).json({
      error: "Failed to delete record",
    });
  }
});

// Bulk CSV import API
app.post("/api/:entity/bulk", async (req, res) => {
  try {
    const entityName = req.params.entity;
    const { rows, userId } = req.body;

    if (!isValidEntity(entityName)) {
      return res.status(404).json({
        error: "Entity not found",
      });
    }

    if (!userId) {
      return res.status(400).json({
        error: "userId is required",
      });
    }

    if (!rows || !Array.isArray(rows)) {
      return res.status(400).json({
        error: "rows must be an array",
      });
    }

    const bulkValidation = validateBulkRowsAgainstConfig(entityName, rows);

if (!bulkValidation.isValid) {
  return res.status(400).json({
    error: "Bulk validation failed",
    invalidRows: bulkValidation.errors,
  });
}

    const recordsToInsert = bulkValidation.validRows.map((row) => ({
      entity: entityName,
      userId,
      data: cleanRecordData(row),
    }));

    await prisma.appRecord.createMany({
      data: recordsToInsert,
    });

    const insertedRecords = await prisma.appRecord.findMany({
      where: {
        entity: entityName,
        userId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: rows.length,
    });

    const formattedItems = insertedRecords.map(formatRecord);

    await runHook("afterBulkImport", {
      userId,
      entityName,
      count: formattedItems.length,
      items: formattedItems,
    });

    res.status(201).json({
      success: true,
      inserted: formattedItems.length,
      data: formattedItems,
    });
  } catch (error) {
    console.error("Bulk import error:", error);

    res.status(500).json({
      error: "Failed to import records",
    });
  }
});

app.listen(5000, () => {
  console.log("Backend running on http://localhost:5000");
});