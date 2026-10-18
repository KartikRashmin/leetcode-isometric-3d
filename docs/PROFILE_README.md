# Add the graph to a GitHub profile README

This guide puts your own dark and light LeetCode graphs in a GitHub profile README and refreshes them daily. You need a public LeetCode username and a GitHub profile repository. No LeetCode credentials or secrets are required.

## 1. Prepare your profile repository

A GitHub profile README lives in a **public repository whose name matches your GitHub username**. Its root `README.md` appears on your profile. If you already have that repository, keep it and add the graph to your existing README.

The steps below assume the repository has a root `README.md` and that generated images will live in `assets/`. You make all of these changes in your own profile repository.

## 2. Add the refresh workflow

Copy [the complete example workflow](../examples/workflows/update-leetcode.yml) into your profile repository at:

```text
.github/workflows/update-leetcode.yml
```

Change `YOUR_LEETCODE_USERNAME` in its `with:` block to your public LeetCode username. Leave `uses: KartikRashmin/leetcode-isometric-3d@v1` to follow compatible v1 releases, or use `@v1.0.0` to pin this exact release. The default `output-dir: assets` matches the image paths below.

The workflow grants `contents: write` because it commits generated files. It stages only the two SVGs, creates a commit only when their content changes, and runs daily at 04:17 UTC. It also has a manual `workflow_dispatch` trigger. If you change the output directory, update both the workflow's `git add` paths and the README image paths.

Commit the workflow on your profile repository's default branch. Scheduled GitHub Actions run from that branch, so a workflow present only on a feature branch will not run on its schedule.

## 3. Generate the first pair

Open your profile repository's **Actions** tab, select **Refresh LeetCode isometric graphs**, and choose **Run workflow**. Wait for the job to succeed. You should see two new files in `assets/`:

```text
assets/leetcode-isometric-dark.svg
assets/leetcode-isometric-light.svg
```

Open both files on GitHub to inspect them before adding the README links. Later runs keep the same filenames so those links stay valid.

## 4. Embed the images

Add this snippet wherever you want the graph in your profile repository's root `README.md`:

```markdown
![LeetCode activity dark](assets/leetcode-isometric-dark.svg#gh-dark-mode-only)
![LeetCode activity light](assets/leetcode-isometric-light.svg#gh-light-mode-only)
```

GitHub shows the dark file in dark mode and the light file in light mode. Preview your rendered profile in both themes and commit the README change.

For one static image, link either SVG without the `#gh-…-mode-only` fragment. You can also generate files locally with the [CLI instructions](../README.md#requirements-and-local-use), commit them to your repository, and skip the scheduled workflow.

## Customize the graph

The Action accepts `width` and `height` at a 5:3 ratio, `heading`, `show-stats`, and `show-credit`. For example:

```yaml
- uses: KartikRashmin/leetcode-isometric-3d@v1
  with:
    username: YOUR_LEETCODE_USERNAME
    output-dir: assets
    width: '500'
    height: '300'
    heading: Problems Solved
    show-credit: 'false'
```

The files remain SVG and keep the original graph proportions. For all inputs, see the [Action table](../README.md#reusable-github-action).

## If something goes wrong

| Symptom | Check |
| --- | --- |
| The workflow does not appear in **Actions** | Commit the workflow file under `.github/workflows/` on the default branch. |
| The Action cannot find your LeetCode profile | Check your exact public username at `https://leetcode.com/u/YOUR_LEETCODE_USERNAME/` and run the workflow again. |
| Generation fails temporarily | Check the run log for a LeetCode endpoint or rate-limit error. Failed runs leave previous good SVGs in place. |
| The generated files do not appear in your repository | Check the workflow's `contents: write` permission, repository Actions settings, and branch rules. Protected branches may require a pull request workflow instead of a direct push. |
| The README shows broken images | Confirm the generated filenames and relative paths match the Markdown snippet exactly. The first workflow run must complete before the images exist. |
| The daily schedule does not fire | Keep the workflow on the default branch and check whether GitHub has disabled scheduled workflows in an inactive or forked repository. Use **Run workflow** manually to test it. |

GitHub documents [profile README requirements](https://docs.github.com/en/account-and-profile/how-tos/profile-customization/managing-your-profile-readme), [scheduled workflow behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), and [theme-specific images](https://github.blog/changelog/2021-11-24-specify-theme-context-for-images-in-markdown/).
