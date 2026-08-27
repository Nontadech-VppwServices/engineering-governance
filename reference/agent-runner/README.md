# Isolated Agent Runner

The runner clones one repository branch into a job-specific workspace, asks the internal Hermes Coder profile to edit files, independently runs repository quality scripts, verifies branch ancestry, commits and pushes. It rejects merge/deploy/production-credential permissions and validates all paths and result fields. Hermes Coder never commits, pushes, merges or deploys.
