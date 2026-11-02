/* eslint-disable @typescript-eslint/naming-convention */

import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";

import { AddReceiptModal } from "@/components/add-receipt-modal";

describe("AddReceiptModal (US 2.1 Task 2)", () => {
  it("renders nothing while closed", async () => {
    const { queryByLabelText } = await render(
      <AddReceiptModal visible={false} onClose={jest.fn()} />
    );

    expect(queryByLabelText("Store")).toBeNull();
  });

  it("shows store, one item row, tax and tip when open", async () => {
    const { getByLabelText, queryByLabelText } = await render(
      <AddReceiptModal visible onClose={jest.fn()} />
    );

    expect(getByLabelText("Store")).toBeTruthy();
    expect(getByLabelText("Item 1 name")).toBeTruthy();
    expect(getByLabelText("Item 1 price")).toBeTruthy();
    expect(getByLabelText("Tax")).toBeTruthy();
    expect(getByLabelText("Tip")).toBeTruthy();
    expect(queryByLabelText("Item 2 name")).toBeNull();
  });

  it("adds an item row", async () => {
    const { getByLabelText, findByLabelText } = await render(
      <AddReceiptModal visible onClose={jest.fn()} />
    );

    await fireEvent.press(getByLabelText("Add item"));

    expect(await findByLabelText("Item 2 name")).toBeTruthy();
  });

  it("removes an item row", async () => {
    const { getByLabelText, findByLabelText, queryByLabelText } =
      await render(<AddReceiptModal visible onClose={jest.fn()} />);

    await fireEvent.press(getByLabelText("Add item"));
    await findByLabelText("Item 2 name");
    await fireEvent.press(getByLabelText("Remove item 2"));

    expect(queryByLabelText("Item 2 name")).toBeNull();
    expect(queryByLabelText("Remove item 1")).toBeNull();
  });

  it("updates the total from items, tax and tip", async () => {
    const { getByLabelText, getByTestId, findByLabelText } = await render(
      <AddReceiptModal visible onClose={jest.fn()} />
    );

    await fireEvent.changeText(getByLabelText("Item 1 price"), "10.00");
    await fireEvent.press(getByLabelText("Add item"));
    await fireEvent.changeText(await findByLabelText("Item 2 price"), "4.50");
    await fireEvent.changeText(getByLabelText("Tax"), "1.16");
    await fireEvent.changeText(getByLabelText("Tip"), "2");

    expect(getByTestId("receipt-total").props.children).toBe("$17.66");
  });

  it("shows a hint when an amount is not a number", async () => {
    const { getByLabelText, findByText } = await render(
      <AddReceiptModal visible onClose={jest.fn()} />
    );

    await fireEvent.changeText(getByLabelText("Item 1 price"), "abc");

    expect(
      await findByText("Check amounts: use numbers like 12.50.")
    ).toBeTruthy();
  });

  it("calls onClose when Close is pressed", async () => {
    const onClose = jest.fn();
    const { getByLabelText } = await render(
      <AddReceiptModal visible onClose={onClose} />
    );

    await fireEvent.press(getByLabelText("Close"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});