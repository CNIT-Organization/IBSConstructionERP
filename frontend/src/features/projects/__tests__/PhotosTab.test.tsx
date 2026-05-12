// @ts-nocheck
/**
 * Smoke tests for the project Photos tab.
 *
 * Verifies:
 *  - empty state when no project is active
 *  - grid renders fake photos
 *  - lightbox opens on tile click and closes on ESC
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/features/file-manager/hooks', () => ({
  useFileList: vi.fn(),
}));

// The UploadDialog imports the global upload queue store and the documents
// upload endpoint — stub it out so the photos tab can render in isolation.
vi.mock('@/features/file-manager/components/UploadDialog', () => ({
  UploadDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="mock-upload-dialog">Upload Dialog</div> : null,
}));

import { useFileList } from '@/features/file-manager/hooks';
import { PhotosTab } from '../PhotosTab';

const fakePhotos = [
  {
    id: 'photo-1',
    kind: 'photo',
    name: 'foundation_pour.jpg',
    project_id: 'proj-1',
    size_bytes: 245_760,
    mime_type: 'image/jpeg',
    extension: 'jpg',
    modified_at: '2026-05-01T10:00:00Z',
    physical_path: '/p/photo-1.jpg',
    relative_path: 'photo-1.jpg',
    storage_backend: 'local',
    download_url: '/api/v1/files/photo-1/raw',
    preview_url: '/api/v1/files/photo-1/raw',
    thumbnail_url: '/api/v1/files/photo-1/thumb',
    discipline: null,
    category: null,
    extra: {},
  },
  {
    id: 'photo-2',
    kind: 'photo',
    name: 'rebar_inspection.jpg',
    project_id: 'proj-1',
    size_bytes: 512_000,
    mime_type: 'image/jpeg',
    extension: 'jpg',
    modified_at: '2026-05-02T14:30:00Z',
    physical_path: '/p/photo-2.jpg',
    relative_path: 'photo-2.jpg',
    storage_backend: 'local',
    download_url: '/api/v1/files/photo-2/raw',
    preview_url: '/api/v1/files/photo-2/raw',
    thumbnail_url: '/api/v1/files/photo-2/thumb',
    discipline: null,
    category: null,
    extra: { captured_at: '2026-05-02T14:30:00Z' },
  },
  {
    id: 'photo-3',
    kind: 'photo',
    name: 'site_overview.png',
    project_id: 'proj-1',
    size_bytes: 1_048_576,
    mime_type: 'image/png',
    extension: 'png',
    modified_at: '2026-05-03T09:15:00Z',
    physical_path: '/p/photo-3.png',
    relative_path: 'photo-3.png',
    storage_backend: 'local',
    download_url: '/api/v1/files/photo-3/raw',
    preview_url: '/api/v1/files/photo-3/raw',
    thumbnail_url: null, // tile must still render via placeholder
    discipline: null,
    category: null,
    extra: {},
  },
];

function renderWithProviders(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PhotosTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the no-project empty state when projectId is null', () => {
    (useFileList as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: false,
    });

    renderWithProviders(<PhotosTab projectId={null} />);

    expect(screen.getByTestId('photos-tab-no-project')).toBeInTheDocument();
    expect(screen.getByText(/No active project/i)).toBeInTheDocument();
  });

  it('renders the no-photos empty state with an upload CTA when the list is empty', () => {
    (useFileList as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { project_id: 'proj-1', items: [], total: 0, limit: 500, offset: 0 },
      isLoading: false,
    });

    renderWithProviders(<PhotosTab projectId="proj-1" />);

    expect(screen.getByTestId('photos-tab-empty')).toBeInTheDocument();
    expect(screen.getByText(/No photos yet/i)).toBeInTheDocument();
    expect(screen.getByTestId('photos-tab-upload-empty')).toBeInTheDocument();
  });

  it('renders 3 photo tiles when the API returns 3 photos', async () => {
    (useFileList as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { project_id: 'proj-1', items: fakePhotos, total: 3, limit: 500, offset: 0 },
      isLoading: false,
    });

    renderWithProviders(<PhotosTab projectId="proj-1" />);

    expect(screen.getByTestId('photos-tab-grid')).toBeInTheDocument();
    expect(screen.getByTestId('photos-tab-tile-photo-1')).toBeInTheDocument();
    expect(screen.getByTestId('photos-tab-tile-photo-2')).toBeInTheDocument();
    expect(screen.getByTestId('photos-tab-tile-photo-3')).toBeInTheDocument();

    // Filenames should be visible
    expect(screen.getByText('foundation_pour.jpg')).toBeInTheDocument();
    expect(screen.getByText('rebar_inspection.jpg')).toBeInTheDocument();
    expect(screen.getByText('site_overview.png')).toBeInTheDocument();
  });

  it('opens the lightbox when a tile is clicked and closes on ESC', async () => {
    (useFileList as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { project_id: 'proj-1', items: fakePhotos, total: 3, limit: 500, offset: 0 },
      isLoading: false,
    });

    renderWithProviders(<PhotosTab projectId="proj-1" />);

    // No lightbox initially
    expect(screen.queryByTestId('photos-tab-lightbox')).not.toBeInTheDocument();

    // Click the first tile
    fireEvent.click(screen.getByTestId('photos-tab-tile-photo-1'));

    await waitFor(() => {
      expect(screen.getByTestId('photos-tab-lightbox')).toBeInTheDocument();
    });
    // Full-res image should be rendered
    expect(screen.getByTestId('photos-tab-lightbox-image')).toHaveAttribute(
      'src',
      '/api/v1/files/photo-1/raw',
    );

    // Press ESC
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByTestId('photos-tab-lightbox')).not.toBeInTheDocument();
    });
  });

  it('filters tiles by filename via the search input', async () => {
    (useFileList as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { project_id: 'proj-1', items: fakePhotos, total: 3, limit: 500, offset: 0 },
      isLoading: false,
    });

    renderWithProviders(<PhotosTab projectId="proj-1" />);

    const search = screen.getByTestId('photos-tab-search') as HTMLInputElement;
    fireEvent.change(search, { target: { value: 'rebar' } });

    await waitFor(() => {
      expect(screen.queryByTestId('photos-tab-tile-photo-1')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('photos-tab-tile-photo-2')).toBeInTheDocument();
    expect(screen.queryByTestId('photos-tab-tile-photo-3')).not.toBeInTheDocument();
  });
});
