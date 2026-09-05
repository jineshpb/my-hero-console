import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { applySlotToIdentity, kitIdentityFromSlot } from "@/lib/kiosk";

const STATUS_EXTENDED_OPTIONS = [
  { value: "0", label: "Off — original three-field status ping" },
  { value: "1", label: "On — extra telemetry (backend must allow)" },
];

const Field = ({ id, label, hint, children }) => (
  <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    {children}
    {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
  </div>
);

const Section = ({ title, children }) => (
  <fieldset className="space-y-4">
    <legend className="text-sm font-medium text-foreground">{title}</legend>
    {children}
  </fieldset>
);

export const KitIdentityFields = ({ idPrefix, values, onChange, savedSecrets, mode = "create" }) => {
  const derived = kitIdentityFromSlot(values.slot);
  const isEdit = mode === "edit";

  const handleChange = (key) => (event) => {
    const value = event.target.value;
    onChange((current) => (key === "slot" ? applySlotToIdentity(current, value) : { ...current, [key]: value }));
  };

  return (
    <div className="flex flex-col gap-6">
      <Section title="Kit identity">
        <Field
          id={`${idPrefix}-slot`}
          label="Kit Slot"
          hint="Sets hostname, mDNS, and the setup-portal SSID. Must be unique per kit."
        >
          <Input
            id={`${idPrefix}-slot`}
            className="w-24 font-mono"
            value={values.slot}
            onChange={handleChange("slot")}
            placeholder="01"
            maxLength={7}
            autoFocus={mode === "create"}
            aria-label="Kit slot"
          />
        </Field>
        {isEdit || values.mac ? (
          <Field
            id={`${idPrefix}-mac`}
            label="Controller MAC"
            hint={
              isEdit
                ? "ESP32 factory Wi-Fi MAC. Blank unbinds USB identity."
                : "Read from the plugged-in board."
            }
          >
            <Input
              id={`${idPrefix}-mac`}
              className="font-mono"
              value={values.mac || ""}
              onChange={handleChange("mac")}
              readOnly={!isEdit}
              tabIndex={0}
              placeholder="AA:BB:CC:DD:EE:FF"
              maxLength={17}
              aria-label="Controller MAC"
            />
          </Field>
        ) : null}
        <Field
          id={`${idPrefix}-hostname`}
          label="Hostname"
          hint={
            derived.firmwareHostname
              ? `Console name ${derived.hostname}. Firmware mDNS/AP ${derived.firmwareHostname}.`
              : "Assigned from the slot after you enter one."
          }
        >
          <Input
            id={`${idPrefix}-hostname`}
            className="font-mono"
            value={derived.hostname}
            readOnly
            tabIndex={0}
            aria-label="Derived hostname"
          />
        </Field>
        <Field id={`${idPrefix}-device-id`} label="Device ID" hint="Firmware default is esp32-sos-{slot}.">
          <Input
            id={`${idPrefix}-device-id`}
            className="font-mono"
            value={values.device_id}
            onChange={handleChange("device_id")}
            maxLength={31}
            aria-label="Device ID"
          />
        </Field>
        <Field id={`${idPrefix}-device-name`} label="Device Name">
          <Input
            id={`${idPrefix}-device-name`}
            value={values.device_name}
            onChange={handleChange("device_name")}
            maxLength={63}
            aria-label="Device name"
          />
        </Field>
        <Field id={`${idPrefix}-location`} label="Location Label">
          <Input
            id={`${idPrefix}-location`}
            value={values.location_label}
            onChange={handleChange("location_label")}
            maxLength={63}
            aria-label="Location label"
          />
        </Field>
        <Field id={`${idPrefix}-kit-id`} label="Kit ID" hint="Backend identity stored in NVS as kitId.">
          <Input
            id={`${idPrefix}-kit-id`}
            className="font-mono"
            value={values.kit_id}
            onChange={handleChange("kit_id")}
            maxLength={47}
            aria-label="Kit ID"
          />
        </Field>
        <Field
          id={`${idPrefix}-kit-secret`}
          label="Kit Secret"
          hint={
            isEdit
              ? savedSecrets?.kit_secret
                ? "A secret is saved. Leave blank to keep it."
                : "Not set yet."
              : "Blank is allowed until the kit is provisioned."
          }
        >
          <Input
            id={`${idPrefix}-kit-secret`}
            type="password"
            autoComplete="new-password"
            value={values.kit_secret}
            onChange={handleChange("kit_secret")}
            maxLength={79}
            placeholder={isEdit && savedSecrets?.kit_secret ? "unchanged" : ""}
            aria-label="Kit secret"
          />
        </Field>
        <Field
          id={`${idPrefix}-status-hash`}
          label="Status Hash"
          hint={
            isEdit
              ? savedSecrets?.status_hash
                ? "A hash is saved. Leave blank to keep it."
                : "Not set yet."
              : "Sent with the status ping."
          }
        >
          <Input
            id={`${idPrefix}-status-hash`}
            type="password"
            autoComplete="new-password"
            className="font-mono"
            value={values.status_hash}
            onChange={handleChange("status_hash")}
            maxLength={79}
            placeholder={isEdit && savedSecrets?.status_hash ? "unchanged" : ""}
            aria-label="Status hash"
          />
        </Field>
        <Field
          id={`${idPrefix}-status-ext`}
          label="Extended Status Fields"
          hint="Turn on only once the backend accepts extra telemetry."
        >
          <Select
            id={`${idPrefix}-status-ext`}
            value={values.status_extended}
            onChange={(value) => onChange((current) => ({ ...current, status_extended: value }))}
            options={STATUS_EXTENDED_OPTIONS}
            aria-label="Extended status fields"
          />
        </Field>
        <Field
          id={`${idPrefix}-access-pin`}
          label="Service PIN"
          hint={
            isEdit
              ? savedSecrets?.access_pin
                ? "A PIN is saved. Leave blank to keep it. Guards /config, /servo, and /cards."
                : "Guards /config, /servo, and /cards."
              : "Guards /config, /servo, and /cards on the kit."
          }
        >
          <Input
            id={`${idPrefix}-access-pin`}
            type="password"
            autoComplete="new-password"
            value={values.access_pin}
            onChange={handleChange("access_pin")}
            maxLength={17}
            placeholder={isEdit && savedSecrets?.access_pin ? "unchanged" : ""}
            aria-label="Service PIN"
          />
        </Field>
      </Section>

      <Section title="APIs">
        <Field id={`${idPrefix}-webhook`} label="SOS API URL">
          <Input
            id={`${idPrefix}-webhook`}
            className="font-mono text-xs"
            value={values.webhook_url}
            onChange={handleChange("webhook_url")}
            maxLength={159}
            aria-label="SOS API URL"
          />
        </Field>
        <Field id={`${idPrefix}-heartbeat`} label="Status API URL">
          <Input
            id={`${idPrefix}-heartbeat`}
            className="font-mono text-xs"
            value={values.heartbeat_url}
            onChange={handleChange("heartbeat_url")}
            maxLength={159}
            aria-label="Status API URL"
          />
        </Field>
      </Section>

      <Section title="Notes">
        <Field id={`${idPrefix}-notes`} label="Notes" hint="Console only. Not written to the chip.">
          <Input
            id={`${idPrefix}-notes`}
            value={values.notes}
            onChange={handleChange("notes")}
            aria-label="Kiosk notes"
          />
        </Field>
      </Section>
    </div>
  );
};
