import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ColumnBrowser from "./ColumnBrowser";

// jsdom doesn't implement scrollIntoView
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const defaultProps = {
  artists: ["Radiohead", "Bjork", "Aphex Twin"],
  albums: ["OK Computer", "Homogenic", "Selected Ambient Works"],
  selectedArtist: null,
  selectedAlbum: null,
  onArtistSelect: vi.fn(),
  onAlbumSelect: vi.fn(),
};

function renderBrowser(overrides = {}) {
  return render(<ColumnBrowser {...defaultProps} {...overrides} />);
}

describe("ColumnBrowser", () => {
  it("renders two columns with titles", () => {
    renderBrowser();

    expect(screen.getByText("Artist")).toBeTruthy();
    expect(screen.getByText("Album")).toBeTruthy();
  });

  it("renders artist items in the artist column", () => {
    renderBrowser();

    expect(screen.getByText("Radiohead")).toBeTruthy();
    expect(screen.getByText("Bjork")).toBeTruthy();
    expect(screen.getByText("Aphex Twin")).toBeTruthy();
  });

  it("renders album items in the album column", () => {
    renderBrowser();

    expect(screen.getByText("OK Computer")).toBeTruthy();
    expect(screen.getByText("Homogenic")).toBeTruthy();
    expect(screen.getByText("Selected Ambient Works")).toBeTruthy();
  });

  it("shows 'All' option with correct count for each column", () => {
    renderBrowser();

    // Both columns have 3 items, so there should be two "All (3)" buttons
    const allButtons = screen.getAllByText("All (3)");
    expect(allButtons.length).toBe(2);
  });

  it("calls onArtistSelect when clicking an artist", async () => {
    const onArtistSelect = vi.fn();
    const user = userEvent.setup();
    renderBrowser({ onArtistSelect });

    await user.click(screen.getByText("Radiohead"));

    expect(onArtistSelect).toHaveBeenCalledWith("Radiohead");
  });

  it("calls onAlbumSelect when clicking an album", async () => {
    const onAlbumSelect = vi.fn();
    const user = userEvent.setup();
    renderBrowser({ onAlbumSelect });

    await user.click(screen.getByText("OK Computer"));

    expect(onAlbumSelect).toHaveBeenCalledWith("OK Computer");
  });

  it("calls onSelect with null when clicking 'All'", async () => {
    const onArtistSelect = vi.fn();
    const user = userEvent.setup();
    renderBrowser({ onArtistSelect });

    // The first "All (3)" button belongs to the artist column
    const allButtons = screen.getAllByText("All (3)");
    await user.click(allButtons[0]);

    expect(onArtistSelect).toHaveBeenCalledWith(null);
  });

  it("highlights the selected artist with aria-selected", () => {
    renderBrowser({ selectedArtist: "Bjork" });

    const bjorkButton = screen.getByText("Bjork");
    expect(bjorkButton.getAttribute("aria-selected")).toBe("true");
  });

  it("highlights the selected album with aria-selected", () => {
    renderBrowser({ selectedAlbum: "Homogenic" });

    const homogenicButton = screen.getByText("Homogenic");
    expect(homogenicButton.getAttribute("aria-selected")).toBe("true");
  });

  it("has listbox ARIA role on scrollable containers", () => {
    renderBrowser();

    const listboxes = screen.getAllByRole("listbox");
    expect(listboxes.length).toBe(2);
  });

  it("has option ARIA role on items", () => {
    renderBrowser();

    const options = screen.getAllByRole("option");
    // 3 artists + 1 "All" + 3 albums + 1 "All" = 8
    expect(options.length).toBe(8);
  });

  it("shows 'No items' when arrays are empty", () => {
    renderBrowser({ artists: [], albums: [] });

    const noItems = screen.getAllByText("No items");
    expect(noItems.length).toBe(2);
  });

  it("keyboard ArrowDown navigates to next item", async () => {
    const onArtistSelect = vi.fn();
    const user = userEvent.setup();
    renderBrowser({ onArtistSelect, selectedArtist: null });

    // Focus the artist listbox
    const listboxes = screen.getAllByRole("listbox");
    const artistListbox = listboxes[0];

    // Tab into the listbox, then press ArrowDown
    artistListbox.focus();
    await user.keyboard("{ArrowDown}");

    // When selectedArtist is null (index 0 = "All"), ArrowDown should select the first artist
    expect(onArtistSelect).toHaveBeenCalledWith("Radiohead");
  });

  it("keyboard ArrowUp navigates to previous item", async () => {
    const onArtistSelect = vi.fn();
    const user = userEvent.setup();
    renderBrowser({ onArtistSelect, selectedArtist: "Bjork" });

    const listboxes = screen.getAllByRole("listbox");
    const artistListbox = listboxes[0];

    artistListbox.focus();
    await user.keyboard("{ArrowUp}");

    // Bjork is at index 2 (null=0, Radiohead=1, Bjork=2), ArrowUp => Radiohead
    expect(onArtistSelect).toHaveBeenCalledWith("Radiohead");
  });
});
