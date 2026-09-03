const has = (log, pattern) => Boolean(pattern && pattern.test(log));

const step = (id, label, spec) => ({ id, label, ...spec });

const shared = {
  boot: step("boot", "Boot + reset reason", {
    required: true,
    pass: /Boot #\d+/i,
    fail: /BROWNOUT/i,
    failHint: "Brownout reset — check 5–6 V servo rail / USB power",
  }),
  ledRed: step("led-red", "Status LED red (boot)", {
    required: true,
    pass: /Status LED GPIO\d+: red \(boot\)/i,
  }),
  fuel: step("fuel", "Fuel gauge (MAX1704x)", {
    required: false,
    pass: /Fuel gauge initialized successfully/i,
    fail: /Fuel gauge not detected/i,
    failHint: "MAX1704x not on I2C — optional on a bench board",
  }),
  servo: step("servo", "Door servo idle (GPIO33 LOW)", {
    required: true,
    pass: /Door servo GPIO\d+ idle \(PWM off, pin LOW\)/i,
  }),
  ledAmber: step("led-amber", "Status LED amber (pin checks done)", {
    required: true,
    pass: /Status LED GPIO\d+: amber \(pin checks done\)/i,
  }),
  wav: step("wav", "Siren / I2S WAV buffer", {
    required: true,
    pass: /./,
    fail: /Failed to allocate WAV/i,
    failHint: "Out of RAM allocating the siren buffer",
  }),
  started: step("started", "Started (portal or Wi-Fi)", {
    required: true,
    pass:
      /Device started|Starting WiFiManager portal|Captive portal SSID|Saved WiFi connected|Status LED GPIO\d+: green \(WiFi ready\)|\*wm:StartAP/i,
  }),
};

const contracts = {
  rfid: [
    step("banner", "RFID-ACCESS SKU banner", {
      required: true,
      pass: /ESP32 RFID-ACCESS SKU/i,
      fail: /ESP32 SOS-BUTTON SKU|SOS servo-door WiFiManager/i,
      failHint: "Wrong SKU banner — this is not the RFID-only image",
    }),
    shared.boot,
    shared.ledRed,
    shared.fuel,
    shared.servo,
    step("pins", "RFID pin map", {
      required: true,
      pass: /RFID SKU pins ENROLLED=.*RC522 SS=D5/i,
    }),
    step("rc522", "RC522 detected", {
      required: true,
      pass: /RC522 detected/i,
      fail: /RC522 missing/i,
      failHint: "RC522 not on SPI — check 3V3/GND SS=D5 SCK=D18 MOSI=D23 MISO=D19 RST=TX2",
    }),
    shared.ledAmber,
    shared.wav,
    shared.started,
  ],
  sos: [
    step("banner", "SOS-BUTTON SKU banner", {
      required: true,
      pass: /ESP32 SOS-BUTTON SKU/i,
      fail: /RFID-ACCESS SKU|SOS servo-door WiFiManager/i,
      failHint: "Wrong SKU banner — this is not the SOS-only image",
    }),
    shared.boot,
    shared.ledRed,
    shared.fuel,
    shared.servo,
    step("no-rfid", "No RFID on this SKU", {
      required: true,
      pass: /./,
      fail: /RC522 missing|RC522 detected/i,
      failHint: "RFID lines on an SOS-only image — wrong binary or leftover log",
    }),
    shared.ledAmber,
    shared.wav,
    shared.started,
    step("button", "SOS button path armed", {
      required: false,
      pass: /SOS button down at boot|Device started/i,
    }),
  ],
  combined: [
    step("banner", "Combined SKU banner", {
      required: true,
      pass: /ESP32 SOS servo-door WiFiManager/i,
      fail: /RFID-ACCESS SKU|SOS-BUTTON SKU \(servo door, no RFID\)/i,
      failHint: "Wrong SKU banner — this is not the combined image",
    }),
    shared.boot,
    shared.ledRed,
    shared.fuel,
    shared.servo,
    step("pins", "Button + LED + servo pin map", {
      required: true,
      pass: /Pins BTN=\d+ SOSLED=/i,
    }),
    step("rc522", "RC522 detected", {
      required: true,
      pass: /RC522 detected/i,
      fail: /RC522 missing/i,
      failHint: "RC522 not on SPI — check 3V3/GND SS=D5 SCK=D18 MOSI=D23 MISO=D19 RST=TX2",
    }),
    shared.ledAmber,
    shared.wav,
    shared.started,
  ],
};

const gradeStep = (log, spec) => {
  if (spec.fail && has(log, spec.fail)) {
    return {
      id: spec.id,
      label: spec.label,
      required: spec.required !== false,
      status: spec.required === false ? "warn" : "fail",
      detail: spec.failHint || "failed",
    };
  }
  if (spec.pass && has(log, spec.pass)) {
    return {
      id: spec.id,
      label: spec.label,
      required: spec.required !== false,
      status: "pass",
      detail: "",
    };
  }
  return {
    id: spec.id,
    label: spec.label,
    required: spec.required !== false,
    status: spec.required === false ? "warn" : "fail",
    detail: "not seen in serial capture",
  };
};

export const listAcceptSteps = (skuId) => contracts[skuId] || contracts.combined;

export const gradeBootLog = (skuId, rawLog) => {
  const log = String(rawLog || "");
  const specs = listAcceptSteps(skuId);
  if (!log.trim()) {
    const steps = specs.map((spec) => ({
      id: spec.id,
      label: spec.label,
      required: spec.required !== false,
      status: spec.required === false ? "warn" : "fail",
      detail: "no serial capture",
    }));
    return summarize(skuId, steps, "No boot serial — board did not print setup()");
  }
  const steps = specs.map((spec) => gradeStep(log, spec));
  return summarize(skuId, steps);
};

const summarize = (skuId, steps, forcedSummary) => {
  const passed = steps.filter((step) => step.status === "pass").length;
  const total = steps.length;
  const requiredFailed = steps.some((step) => step.required && step.status === "fail");
  const anyWarn = steps.some((step) => step.status === "warn");
  const grade = requiredFailed ? "fail" : anyWarn ? "warn" : "pass";
  const firstBad = steps.find((step) => step.status === "fail") || steps.find((step) => step.status === "warn");
  const summary =
    forcedSummary ||
    (firstBad ? `${firstBad.label}: ${firstBad.detail || firstBad.status}` : "All boot checks passed");
  return {
    sku: skuId,
    grade,
    score: `${passed}/${total}`,
    passed,
    total,
    summary,
    steps,
  };
};

export const interpretWithLlm = async (skuId, rawLog, report) => {
  const key = process.env.SOS_LLM_KEY || process.env.OPENAI_API_KEY;
  if (!key) {
    return report;
  }
  const url = process.env.SOS_LLM_URL || "https://api.openai.com/v1/chat/completions";
  const model = process.env.SOS_LLM_MODEL || "gpt-4o-mini";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You are a bench technician. The deterministic checker already scored ESP32 boot serial against firmware setup() pin checks. In 2 sentences say what is wrong on the desk (wiring, wrong SKU, power) or confirm the score. Do not invent hardware that the log does not mention.",
          },
          {
            role: "user",
            content: JSON.stringify({
              sku: skuId,
              score: report.score,
              grade: report.grade,
              steps: report.steps,
              serial: String(rawLog || "").slice(-8000),
            }),
          },
        ],
      }),
    });
    const body = await response.json().catch(() => ({}));
    const note = body.choices?.[0]?.message?.content?.trim();
    if (note) {
      return { ...report, llm: note };
    }
  } catch {
    return report;
  } finally {
    clearTimeout(timer);
  }
  return report;
};

export const gradeAndInterpret = async (skuId, rawLog) => {
  const report = gradeBootLog(skuId, rawLog);
  return interpretWithLlm(skuId, rawLog, report);
};
