"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { categories } from "../../lib/data";
import { createCampaign } from "../../lib/api";
import Input from "../Input";
import { Notice } from "../ui";
export default function CampaignForm({
  verified,
  defaultCategory = "Education",
}) {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState("");
  const [document, setDocument] = useState(null);
  const [uploading, setUploading] = useState(false);
  function upload(e, kind) {
    const file = e.target.files?.[0];
    if (!file) { if (kind === "image") setImage(""); else setDocument(null); return; }
    if (kind === "image") setImage(""); else setDocument(null);
    const fileInput = e.target;
    const allowed =
      kind === "image"
        ? ["image/jpeg", "image/png", "image/webp"]
        : ["application/pdf", "image/jpeg", "image/png"];
    if (!allowed.includes(file.type) || file.size > 700000) {
      setNotice(
        kind === "image" ? "Choose a JPG, PNG, or WebP image no larger than 700 KB." : "Choose a PDF, JPG, or PNG document no larger than 700 KB.",
      );
      e.target.value = "";
      if (kind === "image") setImage(""); else setDocument(null);
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      if (kind === "image") setImage(String(reader.result));
      else
        setDocument({
          name: file.name,
          type: file.type,
          data: String(reader.result),
        });
      setUploading(false);
      setNotice("");
    };
    reader.onerror = () => {
      fileInput.value = "";
      setNotice("That file could not be read. Please try again.");
      setUploading(false);
    };
    reader.readAsDataURL(file);
  }
  async function submit(e) {
    e.preventDefault();
    if (busy || uploading) return;
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    const status =
      e.nativeEvent.submitter?.value === "Draft" ? "Draft" : "Pending Approval";
    setBusy(true);
    setNotice("");
    try {
      await createCampaign(
        {
          title: fields.title,
          category: fields.category,
          description: fields.description,
          need: fields.need,
          location: fields.location,
          beneficiaries: fields.beneficiaries,
          startDate: fields.startDate,
          endDate: fields.endDate,
          urgency: fields.urgency,
          image,
          document,
        },
        status,
      );
      router.push("/dashboard/ngo/campaigns");
    } catch (err) {
      setNotice(err.message);
      setBusy(false);
    }
  }
  return (
    <section className="panel narrow">
      <h2>Tell a story worth being part of.</h2>
      <p>
        Be specific about the need, the people you’ll support, and how
        contributions will help.
      </p>
      {!verified && (
        <Notice>
          Your organization is awaiting verification. You can save a complete
          draft now and submit it once approved.
        </Notice>
      )}
      <form className="form" onSubmit={submit}>
        <h3 className="form-section-title">01 · The cause</h3>
        <Input
          label="Campaign title"
          name="title"
          maxLength={100}
          placeholder="A clear, meaningful headline"
        />
        <div className="form-grid">
          <div className="field">
            <label htmlFor="campaign-category">Category *</label>
            <select
              name="category"
              id="campaign-category"
              defaultValue={defaultCategory}
            >
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="urgency">Urgency</label>
            <select name="urgency" id="urgency">
              <option>Normal</option>
              <option>Urgent</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="campaign-description">Your campaign story *</label>
          <textarea
            name="description"
            id="campaign-description"
            required
            rows={5}
            maxLength={5000}
            placeholder="Explain the need, your plan, and how contributions will be used."
          />
        </div>
        <Input
          name="beneficiaries"
          label="Who will this help?"
          placeholder="e.g. 80 children at community schools"
          maxLength={200}
        />
        <Input
          name="location"
          label="Location"
          placeholder="City, State"
          maxLength={100}
        />
        <h3 className="form-section-title">02 · The goal</h3>
        <Input
          name="need"
          label="Target amount (₹)"
          type="number"
          min="1"
          max="100000000"
          step="1"
          placeholder="32000"
        />
        <div className="form-grid">
          <Input name="startDate" label="Start date" type="date" />
          <Input name="endDate" label="End date" type="date" />
        </div>
        <h3 className="form-section-title">03 · Bring the story to life</h3>
        <Input
          label="Campaign image (optional)"
          name="imageFile"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required={false}
          onChange={(e) => upload(e, "image")}
          disabled={busy || uploading}
          hint="JPG, PNG, or WebP, up to 700 KB. A category image is used if you leave this blank."
        />
        {image && (
          <img
            src={image}
            className="upload-preview"
            alt="Your campaign image preview"
          />
        )}
        <Input
          label="Supporting document (optional)"
          name="documentFile"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          required={false}
          onChange={(e) => upload(e, "document")}
          disabled={busy || uploading}
          hint="Documents up to 700 KB. Visible to your organization and administrators."
        />
        {document && (
          <small className="file-description">Ready: {document.name}</small>
        )}
        {notice && <Notice error>{notice}</Notice>}
        <div className="button-row">
          <button
            className="btn btn-outline"
            type="submit"
            value="Draft"
            disabled={busy || uploading}
          >
            Save draft
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            value="Pending Approval"
            disabled={busy || uploading || !verified}
          >
            {uploading
              ? "Reading file…"
              : busy
                ? "Saving campaign…"
                : "Submit for approval →"}
          </button>
        </div>
        <small className="file-description">
          Publishing requires a verified organization and admin approval.
        </small>
      </form>
    </section>
  );
}
