import { STATE_OPTIONS } from "@/lib/states";

export type AddressDefaults = { name?: string; phone?: string; line1?: string; line2?: string | null; city?: string; stateCode?: string; pincode?: string };

export function AddressFields({ d = {}, lockState = false }: { d?: AddressDefaults; lockState?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="shipName">Full name</label>
        <input id="shipName" name="shipName" required defaultValue={d.name} autoComplete="name" className="field" />
      </div>
      <div>
        <label className="label" htmlFor="shipPhone">Mobile number</label>
        <input id="shipPhone" name="shipPhone" required defaultValue={d.phone} inputMode="numeric" pattern="[6-9][0-9]{9}" autoComplete="tel-national" className="field" />
        <p className="hint">For delivery updates. 10 digits.</p>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="line1">Address</label>
        <input id="line1" name="line1" required defaultValue={d.line1} autoComplete="address-line1" className="field" placeholder="House / flat, building, street" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="line2">Area or landmark <span className="font-normal text-muted">(optional)</span></label>
        <input id="line2" name="line2" defaultValue={d.line2 ?? ""} autoComplete="address-line2" className="field" />
      </div>
      <div>
        <label className="label" htmlFor="city">City</label>
        <input id="city" name="city" required defaultValue={d.city} autoComplete="address-level2" className="field" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="pincode">PIN code</label>
          <input id="pincode" name="pincode" required defaultValue={d.pincode} inputMode="numeric" pattern="[1-9][0-9]{5}" autoComplete="postal-code" className="field" />
        </div>
        <div>
          <label className="label" htmlFor="stateCode">State</label>
          {lockState ? (
            <>
              <input type="hidden" name="stateCode" value={d.stateCode} />
              <input id="stateCode" disabled value={STATE_OPTIONS.find(([c]) => c === d.stateCode)?.[1] ?? d.stateCode} className="field bg-paper" />
            </>
          ) : (
            <select id="stateCode" name="stateCode" required defaultValue={d.stateCode ?? ""} className="field">
              <option value="" disabled>Choose</option>
              {STATE_OPTIONS.map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  );
}
