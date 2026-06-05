"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import UploadModal from "./UploadModal";

export default function HeaderActions() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
        <Upload size={16} />
        <span>Upload CSV</span>
      </button>
      {isModalOpen && <UploadModal onClose={() => setIsModalOpen(false)} />}
    </>
  );
}
