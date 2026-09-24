window.__ModuleLoader__.load({ id: "dsh-slot-health", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/SlotBody.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function SlotBody() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      style: {
        padding: 12,
        fontFamily: "inherit",
        fontSize: 13,
        color: "currentColor"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600, marginBottom: 4 }, children: "Slot Health" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { opacity: 0.7, lineHeight: 1.5 }, children: "Plugin active \u2014 endpoint health sampling arrives in a later phase." })
      ]
    }
  );
}

// src/client/SlotTitle.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function SlotTitle() {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "span",
    {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.03em",
        whiteSpace: "nowrap"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "span",
          {
            style: {
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#8b93a7",
              display: "inline-block"
            }
          }
        ),
        "Slot Health"
      ]
    }
  );
}

// src/client/index.tsx
var TAB_ID = "dsh-slot-health";
var inject = ["slots", "sidebarRight", "sidebarRightTabs"];
function apply(ctx) {
  const definition = {
    id: TAB_ID,
    kind: "slot-health",
    title: () => "Slot Health",
    guide: [{
      id: "slot-health",
      order: 300,
      title: () => "Slot Health",
      description: () => "Live health of local llama.cpp and Ollama endpoints"
    }]
  };
  const disposeType = ctx.sidebarRightTabs.register(definition);
  const disposeBody = ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register(
    { name: "sidebar.right.pane.tab", key: TAB_ID },
    SlotBody
  ));
  const disposeTitle = ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register(
    { name: "sidebar.right.pane.tab.title", key: TAB_ID },
    SlotTitle
  ));
  ctx.effect(() => () => {
    disposeTitle();
    disposeBody();
    disposeType();
  }, "slot-health: rightbar tab type");
}
return module.exports; } });
//# sourceMappingURL=client.js.map
