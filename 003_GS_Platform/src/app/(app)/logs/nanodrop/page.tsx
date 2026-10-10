// This page has been removed. Nanodrop data is now handled through the DNA Quantification page.
// This file can be safely deleted.
import { redirect } from 'next/navigation';
export default function NanodropRedirect() {
  redirect('/logs/dna-quantification');
}
