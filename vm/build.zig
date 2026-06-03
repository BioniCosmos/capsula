const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const exe = b.addExecutable(.{
        .name = "vm",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/main.zig"),
            .target = target,
            .optimize = optimize,
            .imports = &.{.{
                .name = "msgpack",
                .module = b.dependency("zig_msgpack", .{ .target = target, .optimize = optimize }).module("msgpack"),
            }},
        }),
    });
    b.installArtifact(exe);

    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());
    if (b.args) |args| {
        run_cmd.addArgs(args);
    }
    b.step("run", "Run the app").dependOn(&run_cmd.step);

    b.step("export", "Build the export dynamic library").dependOn(&b.addInstallArtifact(b.addLibrary(.{
        .name = "vm",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/export.zig"),
            .target = target,
            .optimize = optimize,
        }),
        .linkage = .dynamic,
    }), .{}).step);
}
