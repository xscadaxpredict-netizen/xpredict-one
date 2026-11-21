import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { Customer } from "../api/types";
import { CustomerPicker } from "./CustomerPicker";

const c = (id: string, name: string): Customer => ({
  id, name, contact_person: "Ravi", phone: "9", email: "", address: "", pincode: "",
  city: "Bengaluru", state: "", gst: "", pan: "", created_at: "",
});
const CUSTOMERS = [c("1", "ABC Industries"), c("2", "Kandhan Traders")];

function Harness({ customers = CUSTOMERS }: { customers?: Customer[] }) {
  const [name, setName] = useState("");
  const [id, setId] = useState<string | null>(null);
  const type = (v: string) => {
    const m = customers.find((x) => x.name.toLowerCase() === v.trim().toLowerCase());
    setName(m ? m.name : v);
    setId(m ? m.id : null);
  };
  return <CustomerPicker customers={customers} value={name} selectedId={id} onType={type} onPick={(x) => type(x.name)} />;
}

describe("CustomerPicker", () => {
  it("lists existing customers as soon as the field is focused", () => {
    render(<Harness />);
    fireEvent.focus(screen.getByRole("combobox"));
    expect(screen.getByText("ABC Industries")).toBeInTheDocument();
    expect(screen.getByText("Kandhan Traders")).toBeInTheDocument();
  });

  it("picking one marks it existing", () => {
    render(<Harness />);
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.mouseDown(screen.getByText("Kandhan Traders"));
    expect(screen.getByRole("combobox")).toHaveValue("Kandhan Traders");
    expect(screen.getByText(/Existing customer/)).toBeInTheDocument();
  });

  it("a typed unknown name offers to add it and is marked new", () => {
    render(<Harness />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Sri Water" } });
    expect(screen.getByText(/Add new customer “Sri Water”/)).toBeInTheDocument();
    expect(screen.getByText(/New customer, will be created/)).toBeInTheDocument();
  });

  it("typing an existing name in another case matches it", () => {
    render(<Harness />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "abc industries" } });
    expect(screen.getByText(/Existing customer/)).toBeInTheDocument();
  });

  it("with no customers yet it says so instead of showing nothing", () => {
    render(<Harness customers={[]} />);
    fireEvent.focus(screen.getByRole("combobox"));
    expect(screen.getByText(/No customers yet/)).toBeInTheDocument();
  });
});
