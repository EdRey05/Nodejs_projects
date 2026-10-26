# A small observatory notebook

> A fictional project, written in MD Studio. Every name and measurement in this document is synthetic.

Markdown turns a plain-text notebook into a readable document. Keep the **source on the left** and the *live preview on the right*, then scroll either pane to explore the middle of a long file.

---

## 1. Emphasis and small details

Use **bold for decisions**, *italics for context*, and ***both when a point needs attention***.

Inline HTML can show an outdated idea as <s>crossed out</s> or add <u>underlined text</u>, while `inline code` keeps a setting or filename distinct.

Literal symbols can be escaped: \*these asterisks stay visible\*. A [local section link](#5-a-readable-progress-table) points to the table below without requiring an internet connection.

### A note worth remembering

> Write down the reason for a decision while the reason is still fresh.
>
> A useful notebook explains **what changed**, **why it changed**, and **how it was checked**.

## 2. A practical checklist

- [x] Open the examples folder using the Windows folder picker.
- [x] Edit and save an existing Markdown file.
- [x] Create a new notebook beside the original.
- [ ] Review the middle of the document in Split view.
- [ ] Save, reopen, and verify the final text.

The boxes describe this fictional demonstration. They are rendered from ordinary Markdown source.

## 3. Bullets with a little structure

- **Observation station**
  - A shaded place for the temperature sensor.
  - A level platform for the rain collector.
- **Notebook essentials**
  - Record a timestamp with each observation.
  - Explain unusual readings in a short paragraph.
  - Keep the original notes when an interpretation changes.
- **Review habits**
  - Check units before comparing values.
  - Separate measured values from assumptions.

### Why these details matter

A heading gives the reader a place to stop. A short paragraph supplies the context. A list makes parallel items easy to compare. Mixing these forms is useful when a notebook grows beyond a single screen.

## 4. Numbered steps

1. Choose a quiet location for the fictional station.
2. Label the sample instruments with clear names.
3. Record three observations using the same units.
4. Compare the entries and explain any differences.
5. Save the notebook before moving to the next task.

   A paragraph can belong to a list item too. Indenting it keeps the explanation connected to that step.

## 5. A readable progress table

| Area | Example task | Status | Count |
| :--- | :--- | :---: | ---: |
| Setup | Label the instruments | **Done** | 3 |
| Notes | Write a short description | **Done** | 1 |
| Review | Compare synthetic readings | *In progress* | 4 |
| Handoff | Save the finished notebook | Planned | 1 |

Column alignment can be expressed in the separator row. The source remains plain text; the preview gives the table a clear visual structure.

## 6. Code and configuration

An inline value such as `sample_interval = 15` is useful inside a sentence. A fenced block is better for several related lines:

```python
observations = [18.2, 18.5, 18.4]
average = sum(observations) / len(observations)
print(f"Synthetic average: {average:.1f} C")
```

A small configuration example can use another fence:

```json
{
  "project": "fictional-observatory",
  "units": "metric",
  "reviewed": false
}
```

Code blocks preserve indentation and punctuation. They are displayed as text; the notebook does not run these examples.

---

## 7. Observations from the middle of the notebook

### Morning entry

The first fictional reading was taken in the shade. A light breeze moved across the platform, and the recorder noted that the sensor had not yet settled. This paragraph exists to show how prose wraps naturally in the preview while Markdown punctuation remains visible in the editor.

### Midday entry

The second reading used the same position and units. The notebook records the conditions before offering an interpretation. This is a useful place to pause while scrolling: a long document should remain comfortable to inspect in its middle, not only at its beginning or end.

### Evening entry

The final observation completed the synthetic series. No claim about real weather is being made. The example demonstrates headings, paragraph spacing, emphasis, lists, and code in one saved local file.

## 8. Decisions and follow-up

**Decision:** keep the original entries and add a separate review section.

**Reason:** readers can distinguish the first observation from the later explanation.

**Next action:** review the table, mark the remaining checklist items, and save the document.

> A good handoff makes the next step easy to find.

### Final review

- Are the headings descriptive?
- Do the ordered steps remain in a sensible sequence?
- Is the code fence closed?
- Does the table have a separator row?
- Have the final edits been saved?

---

## End of the example

This notebook was created, previewed, scrolled, saved, and reopened in the real MD Studio app. The document is fictional and safe to use as a demonstration file.
