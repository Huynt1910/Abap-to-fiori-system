const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadUi5Module(filePath, dependencies = {}) {
  let exported;
  const source = fs.readFileSync(filePath, "utf8");
  const context = {
    sap: {
      ui: {
        define(deps, factory) {
          exported = factory(...deps.map((dep) => dependencies[dep]));
        }
      }
    },
    Date,
    setTimeout
  };

  vm.runInNewContext(source, context, { filename: filePath });
  return exported;
}

const root = path.resolve(__dirname, "..");
const MailConstants = loadUi5Module(path.join(root, "webapp", "model", "mailConstants.js"));
const ODataErrorHandler = loadUi5Module(path.join(root, "webapp", "util", "ODataErrorHandler.js"));
const mailFormatter = loadUi5Module(path.join(root, "webapp", "model", "mailFormatter.js"));

class Filter {
  constructor(pathOrConfig, operator, value) {
    Object.assign(this, typeof pathOrConfig === "object" ? pathOrConfig : { path: pathOrConfig, operator, value });
  }
}

class Sorter {
  constructor(path, descending) {
    this.path = path;
    this.descending = descending;
  }
}

let messageData = [];
const Core = {
  getMessageManager() {
    return {
      getMessageModel() {
        return {
          getData() {
            return messageData;
          }
        };
      }
    };
  }
};

const MailService = loadUi5Module(path.join(root, "webapp", "service", "MailService.js"), {
  "sap/ui/core/Core": Core,
  "sap/ui/model/Filter": Filter,
  "sap/ui/model/FilterOperator": { EQ: "EQ", Contains: "Contains" },
  "sap/ui/model/Sorter": Sorter,
  "abap/to/fiori/system/model/mailConstants": MailConstants,
  "abap/to/fiori/system/util/ODataErrorHandler": ODataErrorHandler
});

test("mail formatter maps job, execution, frequency and recipient codes", () => {
  assert.equal(mailFormatter.formatExecutionStatus("S"), "Accepted by SAPconnect");
  assert.equal(mailFormatter.formatExecutionStatusState("F"), "Error");
  assert.match(mailFormatter.formatExecutionStatusTooltip("S"), /Final SMTP delivery status/);
  assert.equal(mailFormatter.formatFrequency("W"), "Weekly");
  assert.equal(mailFormatter.formatRecipientType("B"), "Bcc");
  assert.equal(mailFormatter.canSendNow("J1", ""), true);
  assert.equal(mailFormatter.canSendNow("J1", "", false), false);
  assert.equal(mailFormatter.canSendNow("J1", "J1"), false);
  assert.equal(mailFormatter.canSendNow("", ""), false);
});

test("OData error parser handles 412 and missing SU01 email", () => {
  assert.equal(
    ODataErrorHandler.parse({ status: 412, message: "Precondition Failed" }).message,
    "This Mail Job was changed by another user. The latest data has been loaded. Please review and try again."
  );
  assert.equal(
    ODataErrorHandler.parse({ status: 423, message: "Locked" }).message,
    "This mail job is locked. Refresh the data and try again."
  );
  assert.equal(
    ODataErrorHandler.parse({
      status: 400,
      responseText: JSON.stringify({
        error: {
          code: "ZMIG_ANALYSIS/023",
          message: "Email address is not maintained for SAP user DEV-000"
        }
      })
    }).message,
    "Email address is not maintained for SAP user DEV-000"
  );
});

test("OData error parser extracts multipart batch parse errors", () => {
  const responseText = [
    "--batch",
    "Content-Type: application/http",
    "",
    "HTTP/1.1 400 Bad Request",
    "Content-Type: application/json",
    "",
    "{\"error\":{\"code\":\"CX_SXML_PARSE_ERROR\",\"message\":\"Fehler beim Parsen\"}}",
    "--batch--"
  ].join("\n");

  assert.match(
    ODataErrorHandler.parse({ responseText }).message,
    /Fehler beim Parsen/
  );
});

test("OData error parser prefers backend error message field", () => {
  const responseText = JSON.stringify({
    error: {
      code: "ZMIG_ANALYSIS/022",
      message: "SAP user SA does not exist"
    }
  });

  const parsed = ODataErrorHandler.parse({ status: 400, responseText });

  assert.equal(parsed.code, "ZMIG_ANALYSIS/022");
  assert.equal(parsed.message, "SAP user SA does not exist");
});

test("schedule validation requires dynamic fields for scheduled jobs", () => {
  const service = new MailService({});
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  assert.equal(service.validateSchedule({ Frequency: "O" }, true).length, 0);
  assert.match(service.validateSchedule({ Frequency: "D", StartDate: tomorrow }, true).join("\n"), /Start time/);
  assert.match(service.validateSchedule({ Frequency: "D", StartDate: tomorrow, StartTime: "08:00:00" }, true).join("\n"), /Time zone/);
  assert.match(service.validateSchedule({ Frequency: "D", StartDate: "08/10/2026", StartTime: "08:00:00" }, true).join("\n"), /YYYY-MM-DD/);
  assert.match(service.validateSchedule({ Frequency: "D", StartDate: tomorrow, StartTime: "8 AM" }, true).join("\n"), /HH:mm:ss/);
  assert.match(service.validateSchedule({ Frequency: "W", StartDate: tomorrow, StartTime: "08:00:00", JobTimeZone: "UTC+7" }, true).join("\n"), /Day of week/);
  assert.match(service.validateSchedule({ Frequency: "W", StartDate: tomorrow, StartTime: "08:00:00", JobTimeZone: "UTC+7", DayOfWeek: "9" }, true).join("\n"), /invalid/);
  assert.match(service.validateSchedule({ Frequency: "M", StartDate: tomorrow, StartTime: "08:00:00", JobTimeZone: "UTC+7" }, true).join("\n"), /Day of month/);
  assert.match(service.validateSchedule({ Frequency: "M", StartDate: tomorrow, StartTime: "08:00:00", JobTimeZone: "UTC+7", DayOfMonth: "32" }, true).join("\n"), /1 to 31/);
  assert.equal(service.validateSchedule({ Frequency: "W", StartDate: tomorrow, StartTime: "08:00:00", JobTimeZone: "UTC+7", DayOfWeek: "1" }, true).length, 0);
});

test("schedule payload resets non-applicable fields and keeps month day unpadded", () => {
  const service = new MailService({});

  assert.deepEqual(JSON.parse(JSON.stringify(service.buildSchedulePayload({
    Frequency: "M",
    StartDate: "2026-08-10",
    StartTime: "08:30:00",
    JobTimeZone: "UTC+7",
    DayOfWeek: "5",
    DayOfMonth: "3",
    NextRunAt: "2026-08-10T08:30:00+07:00"
  }))), {
    Frequency: "M",
    StartDate: "2026-08-10",
    StartTime: "08:30:00",
    JobTimeZone: "UTC+7",
    DayOfWeek: MailConstants.scheduleDefaults.dayOfWeek,
    DayOfMonth: "3"
  });

  assert.deepEqual(JSON.parse(JSON.stringify(service.getFrequencyUiState("W"))), {
    showStartDate: true,
    showStartTime: true,
    showDayOfWeek: true,
    showDayOfMonth: false,
    timezoneText: "UTC+7"
  });
});

test("create job runs Inactive to Recipients to Active and omits EmailAddress", async () => {
  const calls = [];
  const jobContext = {
    getPath: () => "/MailJobs(1)",
    created: async () => undefined,
    setProperty: async (property, value) => calls.push(["patch", property, value]),
    requestObject: async () => ({ JobId: "1" })
  };
  const recipientContext = {
    created: async () => undefined,
    requestObject: async () => ({ RecipientId: "R1" })
  };
  const model = {
    bindList(pathValue, contextValue) {
      if (pathValue === "/MailJobs") {
        return {
          create(payload) {
            calls.push(["createJob", payload.Status]);
            assert.equal(payload.Status, "I");
            assert.equal(Object.prototype.hasOwnProperty.call(payload, "StartDate"), false);
            assert.equal(payload.StartTime, MailConstants.scheduleDefaults.startTime);
            assert.equal(payload.JobTimeZone, MailConstants.scheduleDefaults.jobTimeZone);
            assert.equal(payload.DayOfWeek, MailConstants.scheduleDefaults.dayOfWeek);
            assert.equal(payload.DayOfMonth, "1");
            return jobContext;
          }
        };
      }
      if (pathValue === "/MailJobs(1)/_Recipients") {
        return {
          create(payload) {
            calls.push(["createRecipient", payload]);
            assert.deepEqual(Object.keys(payload).sort(), ["RecipientType", "SapUser"]);
            return recipientContext;
          }
        };
      }
      throw new Error(`Unexpected bindList ${pathValue}`);
    }
  };

  const service = new MailService(model);
  await service.createMailJobWithRecipients({
    job: { JobName: "Job", ReportType: "ZREP", FileFormat: "X", Frequency: "O", MailSubject: "Subject" },
    recipients: [{ RecipientType: "T", SapUser: "DEV-130", EmailAddress: "ignore@example.com" }],
    activateAfterCreate: true
  });

  assert.deepEqual(calls.map((call) => call[0]), ["createJob", "createRecipient", "patch"]);
  assert.deepEqual(calls[2], ["patch", "Status", "A"]);
});

test("create job allows empty recipients and keeps the job inactive", async () => {
  const calls = [];
  const jobContext = {
    getPath: () => "/MailJobs(1)",
    created: async () => undefined,
    setProperty: async (property, value) => calls.push(["patch", property, value]),
    requestObject: async () => ({ JobId: "1", Status: "I" })
  };
  const model = {
    bindList(pathValue) {
      assert.equal(pathValue, "/MailJobs");
      return {
        create(payload) {
          calls.push(["createJob", payload.Status]);
          assert.equal(payload.Status, "I");
          return jobContext;
        }
      };
    }
  };

  const service = new MailService(model);
  const created = await service.createMailJobWithRecipients({
    job: { JobName: "Job", ReportType: "ZREP", FileFormat: "X", Frequency: "O", MailSubject: "Subject" },
    recipients: [],
    activateAfterCreate: true
  });

  assert.equal(created.object.JobId, "1");
  assert.deepEqual(calls, [["createJob", "I"]]);
});

test("update job does not patch AnalysisId or Status from the edit wizard copy", async () => {
  const calls = [];
  const service = new MailService({});
  const context = {
    setProperty: async (property, value) => calls.push([property, value]),
    requestObject: async () => ({ JobId: "J1" })
  };

  await service.updateMailJob(context, {
    AnalysisId: "",
    JobName: "Mail ZREP",
    ReportType: "ZREP",
    FileFormat: "X",
    Frequency: "O",
    MailSubject: "Subject",
    MailBody: "",
    Status: "I"
  });

  assert.equal(calls.some((call) => call[0] === "AnalysisId"), false);
  assert.equal(calls.some((call) => call[0] === "Status"), false);
  assert.equal(calls.some((call) => call[0] === "JobName"), true);
});

test("update context skips unchanged fields and submits one batch", async () => {
  const calls = [];
  let active = 0;
  let maxActive = 0;
  const service = new MailService({
    submitBatch: async (groupId) => calls.push(["submitBatch", groupId])
  });
  const context = {
    getObject: () => ({
      JobName: "Mail ZREP",
      ReportType: "ZREP",
      FileFormat: "X",
      Frequency: "O",
      MailSubject: "Old subject",
      StartDate: MailConstants.scheduleDefaults.startDate,
      StartTime: MailConstants.scheduleDefaults.startTime,
      DayOfWeek: MailConstants.scheduleDefaults.dayOfWeek,
      DayOfMonth: MailConstants.scheduleDefaults.dayOfMonth
    }),
    setProperty: async (property, value, groupId) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      calls.push([property, value, groupId]);
      active -= 1;
    },
    requestObject: async () => ({ JobId: "J1" })
  };

  await service.updateMailJob(context, {
    AnalysisId: "",
    JobName: "Mail ZREP",
    ReportType: "ZREP",
    FileFormat: "P",
    Frequency: "O",
    MailSubject: "New subject"
  });

  assert.deepEqual(calls, [
    ["FileFormat", "P", "$auto"],
    ["MailSubject", "New subject", "$auto"],
    ["JobTimeZone", "UTC+7", "$auto"],
    ["submitBatch", "$auto"]
  ]);
  assert.equal(maxActive, 1);
});

test("recipient create rejects immediately when createCompleted reports backend failure", async () => {
  messageData = [];
  let createCompletedHandler;
  let createCompletedListener;
  const service = new MailService({
    bindList(pathValue) {
      assert.equal(pathValue, "/MailJobs(J1)/_Recipients");
      return {
        attachCreateCompleted(fnHandler, oListener) {
          createCompletedHandler = fnHandler;
          createCompletedListener = oListener;
        },
        detachCreateCompleted() {},
        create() {
          const context = {
            created: () => new Promise(() => {}),
            requestObject: async () => ({})
          };

          process.nextTick(() => {
            createCompletedHandler.call(createCompletedListener, {
              getParameter(name) {
                if (name === "context") {
                  return context;
                }
                if (name === "success") {
                  return false;
                }
                if (name === "error") {
                  return {
                    status: 400,
                    responseText: JSON.stringify({
                      error: {
                        code: "ZMIG_ANALYSIS/022",
                        message: "SAP user SA does not exist"
                      }
                    })
                  };
                }
                return undefined;
              }
            });
          });

          return context;
        }
      };
    }
  });

  await assert.rejects(
    () => service.addRecipient("J1", { RecipientType: "T", SapUser: "SA" }),
    (error) => {
      assert.equal(ODataErrorHandler.parse(error).message, "SAP user SA does not exist");
      return true;
    }
  );
});

test("recipient create uses latest UI5 technical message when createCompleted has no error object", async () => {
  let createCompletedHandler;
  let createCompletedListener;

  messageData = [{
    technical: true,
    code: "ZMIG_ANALYSIS/023",
    message: "Email address is not maintained for SAP user DEV-000"
  }];

  const service = new MailService({
    bindList(pathValue) {
      assert.equal(pathValue, "/MailJobs(J1)/_Recipients");
      return {
        attachCreateCompleted(fnHandler, oListener) {
          createCompletedHandler = fnHandler;
          createCompletedListener = oListener;
        },
        detachCreateCompleted() {},
        create() {
          const context = {
            created: () => new Promise(() => {}),
            requestObject: async () => ({})
          };

          process.nextTick(() => {
            createCompletedHandler.call(createCompletedListener, {
              getParameter(name) {
                if (name === "context") {
                  return context;
                }
                if (name === "success") {
                  return false;
                }
                return undefined;
              }
            });
          });

          return context;
        }
      };
    }
  });

  await assert.rejects(
    () => service.addRecipient("J1", { RecipientType: "T", SapUser: "DEV-000" }),
    (error) => {
      assert.equal(ODataErrorHandler.parse(error).message, "Email address is not maintained for SAP user DEV-000");
      return true;
    }
  );

  messageData = [];
});

test("sendNow executes the bound action once using direct group", async () => {
  const calls = [];
  const actionResultContext = {
    requestObject: async () => ({
      SAP__Messages: [{
        type: "S",
        message: "Accepted"
      }]
    })
  };
  const service = new MailService({
    bindContext(actionPath, mailJobContext) {
      calls.push(["bindContext", actionPath, mailJobContext]);
      return {
        execute(groupId) {
          calls.push(["execute", groupId]);
          return Promise.resolve();
        },
        getBoundContext() {
          calls.push(["getBoundContext"]);
          return actionResultContext;
        }
      };
    }
  });
  const mailJobContext = { path: "/MailJobs(J1)" };
  const result = await service.sendNow(mailJobContext);

  assert.equal(calls.filter((call) => call[0] === "execute").length, 1);
  assert.deepEqual(calls[0], ["bindContext", MailConstants.action.sendNow, mailJobContext]);
  assert.deepEqual(calls[1], ["execute", "$direct"]);
  assert.deepEqual(result.SAP__Messages[0].message, "Accepted");
});


test("wizard normalization supplies defaults without mutating an edited schedule", () => {
  const service = new MailService({});
  const job = {Frequency: "W", StartTime: "09:30:00", JobTimeZone: "UTC", DayOfWeek: "3"};
  const normalized = service.normalizeSchedule(job);
  assert.equal(normalized.StartTime, "09:30:00");
  assert.equal(normalized.JobTimeZone, "UTC");
  assert.equal(normalized.DayOfWeek, "3");
  assert.equal(job.StartDate, undefined);
  assert.equal(service.getFrequencyUiState("O").showStartDate, false);
  assert.equal(service.getFrequencyUiState("W").showDayOfWeek, true);
  assert.equal(service.getFrequencyUiState("M").showDayOfMonth, true);
});
