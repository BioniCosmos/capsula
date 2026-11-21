const std = @import("std");
const debug = std.debug;
const Io = std.Io;
const process = std.process;

const msgpack = @import("msgpack");

const VM = @import("VM.zig");

pub fn main(init: process.Init) !void {
    const allocator = init.arena.allocator();
    const io = init.io;

    const args = try init.minimal.args.toSlice(allocator);
    if (args.len < 2) {
        debug.print("bytecode file path required\n", .{});
        return;
    }
    const path = args[1];

    var vm = try VM.init(init.gpa, io);
    defer vm.deinit();

    const file = try Io.Dir.cwd().openFile(io, path, .{});
    defer file.close(io);

    var buf: [1024]u8 = undefined;
    var reader = file.reader(io, &buf);

    var packer = msgpack.packIO(&reader.interface, @constCast(&Io.Writer.failing));
    const payload = try packer.read(allocator);
    const functions = try VM.deserialize(VM.Fn, allocator, vm, payload, "functions");
    vm.structs = try VM.deserialize(VM.StructMeta, allocator, vm, payload, "structs");

    _ = try vm.execute(functions);
}
