 

import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { ComponentProps } from "react";

import { AddReceiptModal } from "@/components/add-receipt-modal";
import type { ReceiptDraft } from "@/lib/receipt-form";

/**
 * Builds a save handler that records each draft it receives.
 * @param received Array that collects the drafts
 * @param message Error message to resolve with, or null for success
 * @returns A save handler for the modal
 */
function createSaver(
  received: ReceiptDraft[],
  message: string | null
): (draft: ReceiptDraft) => Promise<string | null> {
  return (draft) => {
    received.push(draft);
    return Promise.resolve(message);
  };
}

/**
 * Renders the modal open, with working no-op callbacks unless overridden.
 * @param props Optional prop overrides
 * @returns The Testing Library render result
 */
function renderModal(
  props: Partial<ComponentProps<typeof AddReceiptModal>> = {}
): ReturnType<typeof render> {
  return render(
    <AddReceiptModal
      visible
      onClose={jest.fn()}
      onSubmit={createSaver([], null)}
      onSaveDraft={createSaver([], null)}
      {...props}
    />
  );
}

describe("AddReceiptModal (US 2.1 Tasks 2 and 3)", () => {
  it("renders nothing while closed", async () => {
    const { queryByLabelText } = await renderModal({ visible: false });

    expect(queryByLabelText("Store")).toBeNull();
  });

  it("shows store, one item row, tax and tip when open", async () => {
    const { getByLabelText, queryByLabelText } = await renderModal();

    expect(getByLabelText("Store")).toBeTruthy();
    expect(getByLabelText("Item 1 name")).toBeTruthy();
    expect(getByLabelText("Item 1 price")).toBeTruthy();
    expect(getByLabelText("Tax")).toBeTruthy();
    expect(getByLabelText("Tip")).toBeTruthy();
    expect(queryByLabelText("Item 2 name")).toBeNull();
  });

  it("adds an item row", async () => {
    const { getByLabelText, findByLabelText } = await renderModal();

    await fireEvent.press(getByLabelText("Add item"));

    expect(await findByLabelText("Item 2 name")).toBeTruthy();
  });

  it("removes an item row", async () => {
    const { getByLabelText, findByLabelText, queryByLabelText } =
      await renderModal();

    await fireEvent.press(getByLabelText("Add item"));
    await findByLabelText("Item 2 name");
    await fireEvent.press(getByLabelText("Remove item 2"));

    expect(queryByLabelText("Item 2 name")).toBeNull();
    expect(queryByLabelText("Remove item 1")).toBeNull();
  });

  it("updates the total from items, tax and tip", async () => {
    const { getByLabelText, getByTestId, findByLabelText } =
      await renderModal();

    await fireEvent.changeText(getByLabelText("Item 1 price"), "10.00");
    await fireEvent.press(getByLabelText("Add item"));
    await fireEvent.changeText(await findByLabelText("Item 2 price"), "4.50");
    await fireEvent.changeText(getByLabelText("Tax"), "1.16");
    await fireEvent.changeText(getByLabelText("Tip"), "2");

    expect(getByTestId("receipt-total").props.children).toBe("$17.66");
  });

  it("shows a hint when an amount is not a number", async () => {
    const { getByLabelText, findByText } = await renderModal();

    await fireEvent.changeText(getByLabelText("Item 1 price"), "abc");

    expect(
      await findByText("Check amounts: use numbers like 12.50.")
    ).toBeTruthy();
  });

  it("calls onClose when Close is pressed", async () => {
    const onClose = jest.fn();
    const { getByLabelText } = await renderModal({ onClose });

    await fireEvent.press(getByLabelText("Close"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sends the entered receipt to onSubmit", async () => {
    const received: ReceiptDraft[] = [];
    const { getByLabelText } = await renderModal({
      onSubmit: createSaver(received, null),
    });

    await fireEvent.changeText(getByLabelText("Store"), "Costco");
    await fireEvent.changeText(getByLabelText("Item 1 name"), "Milk");
    await fireEvent.changeText(getByLabelText("Item 1 price"), "5");
    await fireEvent.press(getByLabelText("Submit receipt"));

    await waitFor(() => expect(received.length).toBe(1));
    expect(received[0].store).toBe("Costco");
    expect(received[0].items[0].name).toBe("Milk");
    expect(received[0].items[0].price).toBe("5");
  });

  it("sends the entered receipt to onSaveDraft, not onSubmit", async () => {
    const drafts: ReceiptDraft[] = [];
    const submits: ReceiptDraft[] = [];
    const { getByLabelText } = await renderModal({
      onSaveDraft: createSaver(drafts, null),
      onSubmit: createSaver(submits, null),
    });

    await fireEvent.changeText(getByLabelText("Store"), "Costco");
    await fireEvent.press(getByLabelText("Save draft"));

    await waitFor(() => expect(drafts.length).toBe(1));
    expect(submits.length).toBe(0);
  });

  it("clears the form after a successful save", async () => {
    const { getByLabelText } = await renderModal();

    await fireEvent.changeText(getByLabelText("Store"), "Costco");
    await fireEvent.press(getByLabelText("Submit receipt"));

    await waitFor(() => expect(getByLabelText("Store").props.value).toBe(""));
  });

  it("shows the error and keeps the form when a save fails", async () => {
    const { getByLabelText, findByText } = await renderModal({
      onSubmit: createSaver([], "Enter a store name."),
    });

    await fireEvent.changeText(getByLabelText("Item 1 name"), "Milk");
    await fireEvent.press(getByLabelText("Submit receipt"));

    expect(await findByText("Enter a store name.")).toBeTruthy();
    expect(getByLabelText("Item 1 name").props.value).toBe("Milk");
  });

  it("asks for confirmation before deleting", async () => {
    const onClose = jest.fn();
    const { getByLabelText, findByText, findByLabelText } = await renderModal({
      onClose,
    });

    await fireEvent.changeText(getByLabelText("Store"), "Costco");
    await fireEvent.press(getByLabelText("Delete receipt"));

    expect(
      await findByText("Press Confirm delete to discard this receipt.")
    ).toBeTruthy();
    expect(await findByLabelText("Confirm delete")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(getByLabelText("Store").props.value).toBe("Costco");
  });

  it("clears the form and closes after Confirm delete", async () => {
    const onClose = jest.fn();
    const { getByLabelText, findByLabelText } = await renderModal({ onClose });

    await fireEvent.changeText(getByLabelText("Store"), "Costco");
    await fireEvent.press(getByLabelText("Delete receipt"));
    await fireEvent.press(await findByLabelText("Confirm delete"));

    await waitFor(() => expect(getByLabelText("Store").props.value).toBe(""));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});