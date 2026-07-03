import { redirect } from 'next/navigation';

/**
 * /documents has no content of its own yet: loading orders (#32) are the
 * only built documents vertical. Redirect instead of rendering a stub -
 * a page that says "Documents Page" is a dead affordance.
 */
export default function DocumentsPage() {
  redirect('/documents/loading-orders');
}
